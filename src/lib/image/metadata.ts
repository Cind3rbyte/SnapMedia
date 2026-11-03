/**
 * Metadata inspection and lossless removal for images.
 *
 * Pure functions on byte arrays – used inside the image Web Worker and as main-thread fallback.
 *  - JPEG: drops APP1 (EXIF/XMP), APP13 (IPTC), COM, vendor APPn segments and trailing data
 *          (e.g. MPF secondary images). Orientation is preserved through a minimal EXIF block.
 *  - PNG:  drops tEXt/zTXt/iTXt/eXIf/tIME chunks.
 *  - WebP: drops EXIF/XMP chunks and fixes the VP8X flags + RIFF size.
 *  - GIF:  drops comment and XMP/vendor application extensions, keeps the animation intact.
 * Image data is never re-encoded by these functions, so quality is untouched.
 */

export type FindingCategory = "gps" | "device" | "datetime" | "author" | "software" | "other";

export interface MetadataFinding {
  category: FindingCategory;
  label: string;
  value: string;
}

export interface ImageMetadataReport {
  findings: MetadataFinding[];
  hasExif: boolean;
  hasGps: boolean;
  hasXmp: boolean;
  hasIptc: boolean;
  hasComments: boolean;
  hasIcc: boolean;
  orientation: number;
  /** Number of frames for GIFs (1 for still images). */
  frames: number;
}

export interface StripOptions {
  /** Keep the ICC color profile (recommended – it carries no personal data). */
  keepIcc: boolean;
}

/* ----------------------------------------------------------------------------------------------
 * TIFF / EXIF parsing
 * --------------------------------------------------------------------------------------------*/

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

type TagValue = string | number | number[];

interface TiffTags {
  ifd0: Map<number, TagValue>;
  exif: Map<number, TagValue>;
  gps: Map<number, TagValue>;
}

class TiffReader {
  private readonly view: DataView;
  private readonly little: boolean;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly start: number,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const order = String.fromCharCode(bytes[start], bytes[start + 1]);
    if (order !== "II" && order !== "MM") throw new Error("Kein TIFF-Header");
    this.little = order === "II";
    if (this.u16(start + 2) !== 42) throw new Error("Ungültiger TIFF-Header");
  }

  private inRange(offset: number, length: number) {
    return offset >= 0 && offset + length <= this.bytes.length;
  }

  u16(offset: number) {
    return this.inRange(offset, 2) ? this.view.getUint16(offset, this.little) : 0;
  }

  u32(offset: number) {
    return this.inRange(offset, 4) ? this.view.getUint32(offset, this.little) : 0;
  }

  private i32(offset: number) {
    return this.inRange(offset, 4) ? this.view.getInt32(offset, this.little) : 0;
  }

  firstIfdOffset() {
    return this.u32(this.start + 4);
  }

  readIfd(relativeOffset: number): Map<number, TagValue> {
    const tags = new Map<number, TagValue>();
    const base = this.start + relativeOffset;
    if (!relativeOffset || !this.inRange(base, 2)) return tags;
    const count = Math.min(this.u16(base), 512);
    for (let i = 0; i < count; i += 1) {
      const entry = base + 2 + i * 12;
      if (!this.inRange(entry, 12)) break;
      const tag = this.u16(entry);
      const type = this.u16(entry + 2);
      const n = this.u32(entry + 4);
      const size = TYPE_SIZES[type];
      if (!size || n === 0 || n > 1_000_000) continue;
      const total = size * n;
      const valueOffset = total <= 4 ? entry + 8 : this.start + this.u32(entry + 8);
      if (!this.inRange(valueOffset, total)) continue;
      const value = this.readValue(type, n, valueOffset);
      if (value !== undefined) tags.set(tag, value);
    }
    return tags;
  }

  private readValue(type: number, count: number, offset: number): TagValue | undefined {
    switch (type) {
      case 2: {
        const end = Math.min(offset + count, this.bytes.length);
        let text = "";
        for (let i = offset; i < end; i += 1) {
          if (this.bytes[i] === 0) break;
          text += String.fromCharCode(this.bytes[i]);
        }
        return decodeLatin1Utf8(text).trim();
      }
      case 1:
      case 6:
      case 7: {
        const length = Math.min(count, 4096);
        return Array.from(this.bytes.subarray(offset, offset + length));
      }
      case 3: {
        const values: number[] = [];
        for (let i = 0; i < Math.min(count, 64); i += 1) values.push(this.u16(offset + i * 2));
        return values.length === 1 ? values[0] : values;
      }
      case 4:
      case 9: {
        const values: number[] = [];
        for (let i = 0; i < Math.min(count, 64); i += 1) {
          values.push(type === 4 ? this.u32(offset + i * 4) : this.i32(offset + i * 4));
        }
        return values.length === 1 ? values[0] : values;
      }
      case 5:
      case 10: {
        const values: number[] = [];
        for (let i = 0; i < Math.min(count, 64); i += 1) {
          const numerator = type === 5 ? this.u32(offset + i * 8) : this.i32(offset + i * 8);
          const denominator = type === 5 ? this.u32(offset + i * 8 + 4) : this.i32(offset + i * 8 + 4);
          values.push(denominator === 0 ? 0 : numerator / denominator);
        }
        return values.length === 1 ? values[0] : values;
      }
      default:
        return undefined;
    }
  }
}

function decodeLatin1Utf8(text: string): string {
  // EXIF ASCII fields are frequently UTF-8 in practice (e.g. "Ã¼" for "ü").
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

function readTiff(bytes: Uint8Array, start: number): TiffTags | null {
  try {
    const reader = new TiffReader(bytes, start);
    const ifd0 = reader.readIfd(reader.firstIfdOffset());
    const exifPointer = ifd0.get(0x8769);
    const gpsPointer = ifd0.get(0x8825);
    return {
      ifd0,
      exif: typeof exifPointer === "number" ? reader.readIfd(exifPointer) : new Map(),
      gps: typeof gpsPointer === "number" ? reader.readIfd(gpsPointer) : new Map(),
    };
  } catch {
    return null;
  }
}

function asText(value: TagValue | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === "string") return value || null;
  if (typeof value === "number") return String(value);
  return null;
}

/** Decodes UCS-2 "XP*" Windows tags and EXIF UserComment byte arrays. */
function bytesToText(value: TagValue | undefined, ucs2 = false): string | null {
  if (!Array.isArray(value) || value.length === 0) return asText(value);
  const bytes = Uint8Array.from(value);
  let text: string;
  if (ucs2) {
    text = new TextDecoder("utf-16le").decode(bytes);
  } else {
    const header = String.fromCharCode(...bytes.subarray(0, 8));
    const body = bytes.subarray(header.startsWith("ASCII") || header.startsWith("UNICODE") ? 8 : 0);
    text = header.startsWith("UNICODE") ? new TextDecoder("utf-16be").decode(body) : new TextDecoder().decode(body);
  }
  const cleaned = text.replace(/\u0000/g, "").trim();
  return cleaned || null;
}

function formatExifDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const [, y, mo, d, h, mi, s] = match;
  if (y === "0000") return null;
  return `${d}.${mo}.${y}, ${h}:${mi}:${s}`;
}

function gpsCoordinate(value: TagValue | undefined, ref: TagValue | undefined): number | null {
  if (value === undefined || typeof value === "string") return null;
  const parts: number[] = Array.isArray(value) ? value : [value];
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part))) return null;
  const [degrees = 0, minutes = 0, seconds = 0] = parts;
  let decimal = degrees + minutes / 60 + seconds / 3600;
  const reference = typeof ref === "string" ? ref.toUpperCase() : "";
  if (reference === "S" || reference === "W") decimal = -decimal;
  return decimal;
}

function formatLatLon(lat: number, lon: number): string {
  const latText = `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? "N" : "S"}`;
  const lonText = `${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? "O" : "W"}`;
  return `${latText}, ${lonText}`;
}

function findingsFromTiff(tags: TiffTags, report: ImageMetadataReport) {
  const { ifd0, exif, gps } = tags;
  const add = (category: FindingCategory, label: string, value: string | null) => {
    if (value) report.findings.push({ category, label, value });
  };

  const lat = gpsCoordinate(gps.get(0x0002), gps.get(0x0001));
  const lon = gpsCoordinate(gps.get(0x0004), gps.get(0x0003));
  if (lat !== null && lon !== null && !(lat === 0 && lon === 0)) {
    report.hasGps = true;
    add("gps", "GPS-Position", formatLatLon(lat, lon));
  } else if (gps.size > 1) {
    report.hasGps = true;
    add("gps", "GPS-Daten", `${gps.size} GPS-Felder`);
  }
  const altitude = gps.get(0x0006);
  if (typeof altitude === "number" && altitude > 0) {
    add("gps", "Höhe", `${altitude.toFixed(1)} m${gps.get(0x0005) === 1 ? " unter NN" : ""}`);
  }

  const make = asText(ifd0.get(0x010f));
  const model = asText(ifd0.get(0x0110));
  if (make || model) {
    const device = model && make && model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(" ");
    add("device", "Kamera / Gerät", device);
  }
  const lensModel = asText(exif.get(0xa434));
  add("device", "Objektiv", lensModel);
  add("device", "Seriennummer", asText(exif.get(0xa431)));
  add("device", "Objektiv-Seriennummer", asText(exif.get(0xa435)));
  add("author", "Besitzer", asText(exif.get(0xa430)));
  add("author", "Urheber", asText(ifd0.get(0x013b)) ?? bytesToText(ifd0.get(0x9c9d), true));
  add("author", "Copyright", asText(ifd0.get(0x8298)));
  add("software", "Software", asText(ifd0.get(0x0131)));
  add("other", "Bildbeschreibung", asText(ifd0.get(0x010e)));
  add("other", "Kommentar", bytesToText(exif.get(0x9286)) ?? bytesToText(ifd0.get(0x9c9c), true));
  add("other", "Eindeutige Bild-ID", asText(exif.get(0xa420)));
  if (exif.has(0x927c)) add("device", "Hersteller-Rohdaten", "MakerNote vorhanden");

  const taken = formatExifDate(asText(exif.get(0x9003))) ?? formatExifDate(asText(ifd0.get(0x0132)));
  const offset = asText(exif.get(0x9011)) ?? asText(exif.get(0x9010));
  add("datetime", "Aufnahmezeitpunkt", taken ? `${taken}${offset ? ` (UTC${offset})` : ""}` : null);

  const orientation = ifd0.get(0x0112);
  if (typeof orientation === "number" && orientation >= 1 && orientation <= 8) report.orientation = orientation;
}

function scanXmp(xml: string, report: ImageMetadataReport) {
  report.hasXmp = true;
  const read = (name: string): string | null => {
    const attr = new RegExp(`${name}="([^"]+)"`).exec(xml);
    if (attr) return attr[1];
    const element = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
    if (!element) return null;
    const inner = element[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return inner || null;
  };
  const lat = read("exif:GPSLatitude");
  const lon = read("exif:GPSLongitude");
  if (lat && lon) {
    report.hasGps = true;
    report.findings.push({ category: "gps", label: "GPS-Position (XMP)", value: `${lat}, ${lon}` });
  }
  const pairs: Array<[FindingCategory, string, string]> = [
    ["device", "Kamera (XMP)", "tiff:Model"],
    ["software", "Software (XMP)", "xmp:CreatorTool"],
    ["author", "Urheber (XMP)", "dc:creator"],
    ["datetime", "Erstellt (XMP)", "xmp:CreateDate"],
    ["other", "Ort (XMP)", "photoshop:City"],
  ];
  for (const [category, label, name] of pairs) {
    const value = read(name);
    if (value) report.findings.push({ category, label, value });
  }
}

function emptyReport(): ImageMetadataReport {
  return {
    findings: [],
    hasExif: false,
    hasGps: false,
    hasXmp: false,
    hasIptc: false,
    hasComments: false,
    hasIcc: false,
    orientation: 1,
    frames: 1,
  };
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

function hasPrefix(bytes: Uint8Array, offset: number, prefix: number[] | string): boolean {
  const values = typeof prefix === "string" ? Array.from(prefix, (c) => c.charCodeAt(0)) : prefix;
  if (offset + values.length > bytes.length) return false;
  return values.every((value, index) => bytes[offset + index] === value);
}

function readExifBlock(bytes: Uint8Array, start: number, report: ImageMetadataReport) {
  const tiffStart = hasPrefix(bytes, start, EXIF_HEADER) ? start + 6 : start;
  const tags = readTiff(bytes, tiffStart);
  if (!tags) return;
  report.hasExif = true;
  findingsFromTiff(tags, report);
}

/* ----------------------------------------------------------------------------------------------
 * JPEG
 * --------------------------------------------------------------------------------------------*/

interface JpegSegment {
  marker: number;
  start: number;
  /** Offset of the segment payload (after the 2-byte length). */
  dataStart: number;
  end: number;
}

const XMP_SIGNATURE = "http://ns.adobe.com/xap/1.0/\0";
const XMP_EXT_SIGNATURE = "http://ns.adobe.com/xmp/extension/\0";

/** Walks the JPEG header segments up to (excluding) the first SOS marker. */
function jpegHeaderSegments(bytes: Uint8Array): { segments: JpegSegment[]; sosOffset: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Keine gültige JPEG-Datei.");
  const segments: JpegSegment[] = [];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Beschädigte JPEG-Struktur.");
    let marker = bytes[offset + 1];
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1; // fill bytes
      marker = bytes[offset + 1];
    }
    if (marker === 0xda) return { segments, sosOffset: offset };
    if (marker === 0xd9) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) throw new Error("Beschädigte JPEG-Struktur.");
    segments.push({ marker, start: offset, dataStart: offset + 4, end: offset + 2 + length });
    offset += 2 + length;
  }
  throw new Error("JPEG ohne Bilddaten.");
}

/** Finds the end (exclusive) of the primary image, i.e. right after its EOI marker. */
function jpegPrimaryEnd(bytes: Uint8Array, sosOffset: number): number {
  let offset = sosOffset;
  while (offset + 1 < bytes.length) {
    const marker = bytes[offset + 1];
    if (marker === 0xd9) return offset + 2;
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
    } else {
      if (offset + 4 > bytes.length) break;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + length;
      if (marker !== 0xda) continue;
    }
    // Skip entropy coded data: stop at the next marker that is not stuffing (FF00) or RSTn.
    while (offset + 1 < bytes.length) {
      if (bytes[offset] === 0xff) {
        const next = bytes[offset + 1];
        if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7) && next !== 0xff) break;
      }
      offset += 1;
    }
  }
  return bytes.length;
}

function inspectJpeg(bytes: Uint8Array, report: ImageMetadataReport) {
  const { segments } = jpegHeaderSegments(bytes);
  for (const segment of segments) {
    const { marker, dataStart, end } = segment;
    if (marker === 0xe1 && hasPrefix(bytes, dataStart, EXIF_HEADER)) {
      readExifBlock(bytes.subarray(0, end), dataStart, report);
    } else if (marker === 0xe1 && (hasPrefix(bytes, dataStart, XMP_SIGNATURE) || hasPrefix(bytes, dataStart, XMP_EXT_SIGNATURE))) {
      scanXmp(new TextDecoder().decode(bytes.subarray(dataStart, end)), report);
    } else if (marker === 0xed) {
      report.hasIptc = true;
    } else if (marker === 0xfe) {
      report.hasComments = true;
      const text = new TextDecoder().decode(bytes.subarray(dataStart, end)).replace(/\u0000/g, "").trim();
      if (text) report.findings.push({ category: "other", label: "JPEG-Kommentar", value: text.slice(0, 120) });
    } else if (marker === 0xe2 && hasPrefix(bytes, dataStart, "ICC_PROFILE\0")) {
      report.hasIcc = true;
    }
  }
  if (report.hasIptc) {
    report.findings.push({ category: "other", label: "IPTC-Daten", value: "Bildunterschrift, Ort oder Urheber möglich" });
  }
}

/** Minimal EXIF APP1 segment that only carries the orientation tag. */
function orientationSegment(orientation: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22,
    ...EXIF_HEADER,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF header, little endian, IFD0 at 8
    0x01, 0x00, // one entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation & 0xff, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

function stripJpeg(bytes: Uint8Array, options: StripOptions): Uint8Array {
  const { segments, sosOffset } = jpegHeaderSegments(bytes);
  const report = emptyReport();
  inspectJpeg(bytes, report);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientationWritten = report.orientation === 1;
  for (const segment of segments) {
    const { marker, dataStart, start, end } = segment;
    const isJfif = marker === 0xe0 && hasPrefix(bytes, dataStart, "JFIF\0");
    const isIcc = marker === 0xe2 && hasPrefix(bytes, dataStart, "ICC_PROFILE\0");
    const isAdobe = marker === 0xee && hasPrefix(bytes, dataStart, "Adobe");
    const isApp = marker >= 0xe0 && marker <= 0xef;
    let keep = !isApp && marker !== 0xfe;
    if (isJfif || isAdobe || (isIcc && options.keepIcc)) keep = true;
    if (!orientationWritten && !isJfif) {
      parts.push(orientationSegment(report.orientation));
      orientationWritten = true;
    }
    if (keep) parts.push(bytes.subarray(start, end));
  }
  if (!orientationWritten) parts.push(orientationSegment(report.orientation));
  // Image data (all scans of a progressive JPEG included) up to the primary EOI.
  // Data behind the EOI (MPF/depth maps/trailers with their own EXIF) is dropped.
  const primaryEnd = jpegPrimaryEnd(bytes, sosOffset);
  const body = bytes.subarray(sosOffset, primaryEnd);
  parts.push(stripInterScanSegments(body, options));
  return concat(parts);
}

/** Removes APPn/COM segments that some encoders place between the scans of progressive JPEGs. */
function stripInterScanSegments(body: Uint8Array, options: StripOptions): Uint8Array {
  const parts: Uint8Array[] = [];
  let copyFrom = 0;
  let offset = 0;
  while (offset + 1 < body.length) {
    if (body[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = body[offset + 1];
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += marker === 0xff ? 1 : 2;
      continue;
    }
    if (offset + 4 > body.length) break;
    const length = (body[offset + 2] << 8) | body[offset + 3];
    const isMeta = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    const isIcc = marker === 0xe2 && hasPrefix(body, offset + 4, "ICC_PROFILE\0");
    if (isMeta && !(isIcc && options.keepIcc)) {
      parts.push(body.subarray(copyFrom, offset));
      copyFrom = offset + 2 + length;
    }
    offset += 2 + length;
  }
  parts.push(body.subarray(copyFrom));
  return concat(parts);
}

/* ----------------------------------------------------------------------------------------------
 * PNG
 * --------------------------------------------------------------------------------------------*/

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_METADATA_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

interface PngChunk {
  type: string;
  start: number;
  dataStart: number;
  length: number;
  end: number;
}

function pngChunks(bytes: Uint8Array): PngChunk[] {
  if (!hasPrefix(bytes, 0, PNG_SIGNATURE)) throw new Error("Keine gültige PNG-Datei.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("Beschädigte PNG-Struktur.");
    chunks.push({ type, start: offset, dataStart: offset + 8, length, end });
    offset = end;
    if (type === "IEND") break;
  }
  return chunks;
}

function inspectPng(bytes: Uint8Array, report: ImageMetadataReport) {
  for (const chunk of pngChunks(bytes)) {
    const data = bytes.subarray(chunk.dataStart, chunk.dataStart + chunk.length);
    if (chunk.type === "eXIf") {
      readExifBlock(data, 0, report);
    } else if (chunk.type === "iCCP") {
      report.hasIcc = true;
    } else if (chunk.type === "tEXt" || chunk.type === "iTXt" || chunk.type === "zTXt") {
      const separator = data.indexOf(0);
      const keyword = new TextDecoder("latin1").decode(data.subarray(0, separator > 0 ? separator : 0));
      if (keyword === "XML:com.adobe.xmp") {
        scanXmp(new TextDecoder().decode(data.subarray(separator + 1)), report);
        continue;
      }
      report.hasComments = true;
      let value = "(komprimiert)";
      if (chunk.type === "tEXt") {
        value = new TextDecoder("latin1").decode(data.subarray(separator + 1));
      } else if (chunk.type === "iTXt" && data[separator + 1] === 0) {
        // keyword\0 flag method language\0 translated\0 text
        const languageEnd = data.indexOf(0, separator + 3);
        const translatedEnd = languageEnd === -1 ? -1 : data.indexOf(0, languageEnd + 1);
        value = translatedEnd === -1 ? "" : new TextDecoder().decode(data.subarray(translatedEnd + 1));
      }
      const category: FindingCategory =
        /software|creator|tool/i.test(keyword) ? "software" : /author|artist|copyright/i.test(keyword) ? "author" : /time|date/i.test(keyword) ? "datetime" : "other";
      report.findings.push({ category, label: `PNG-Text „${keyword || "?"}“`, value: value.trim().slice(0, 120) || "—" });
    } else if (chunk.type === "tIME") {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (data.length >= 7) {
        const pad = (n: number) => String(n).padStart(2, "0");
        report.findings.push({
          category: "datetime",
          label: "Letzte Änderung (PNG)",
          value: `${pad(data[3])}.${pad(data[2])}.${view.getUint16(0)}, ${pad(data[4])}:${pad(data[5])}:${pad(data[6])}`,
        });
      }
    } else if (chunk.type === "acTL") {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (data.length >= 4) report.frames = Math.max(1, view.getUint32(0));
    }
  }
}

function stripPng(bytes: Uint8Array, options: StripOptions): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  for (const chunk of pngChunks(bytes)) {
    if (PNG_METADATA_CHUNKS.has(chunk.type)) continue;
    if (chunk.type === "iCCP" && !options.keepIcc) continue;
    parts.push(bytes.subarray(chunk.start, chunk.end));
  }
  return concat(parts);
}

/* ----------------------------------------------------------------------------------------------
 * WebP
 * --------------------------------------------------------------------------------------------*/

interface RiffChunk {
  type: string;
  start: number;
  dataStart: number;
  size: number;
  end: number;
}

function webpChunks(bytes: Uint8Array): RiffChunk[] {
  if (!hasPrefix(bytes, 0, "RIFF") || !hasPrefix(bytes, 8, "WEBP")) throw new Error("Keine gültige WebP-Datei.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffEnd = Math.min(bytes.length, 8 + view.getUint32(4, true));
  const chunks: RiffChunk[] = [];
  let offset = 12;
  while (offset + 8 <= riffEnd) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const end = Math.min(riffEnd, offset + 8 + size + (size % 2));
    chunks.push({ type, start: offset, dataStart: offset + 8, size, end });
    offset = end;
  }
  return chunks;
}

function inspectWebp(bytes: Uint8Array, report: ImageMetadataReport) {
  for (const chunk of webpChunks(bytes)) {
    const data = bytes.subarray(chunk.dataStart, chunk.dataStart + chunk.size);
    if (chunk.type === "EXIF") readExifBlock(data, 0, report);
    else if (chunk.type === "XMP ") scanXmp(new TextDecoder().decode(data), report);
    else if (chunk.type === "ICCP") report.hasIcc = true;
    else if (chunk.type === "ANMF") report.frames += 1;
  }
  if (report.frames > 1) report.frames -= 1;
}

function stripWebp(bytes: Uint8Array, options: StripOptions): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const chunk of webpChunks(bytes)) {
    if (chunk.type === "EXIF" || chunk.type === "XMP ") continue;
    if (chunk.type === "ICCP" && !options.keepIcc) continue;
    const copy = bytes.slice(chunk.start, chunk.end);
    if (chunk.type === "VP8X" && copy.length > 8) {
      // Flags: 0x20 ICC, 0x08 EXIF, 0x04 XMP
      copy[8] &= ~(0x08 | 0x04 | (options.keepIcc ? 0 : 0x20));
    }
    parts.push(copy);
  }
  const payload = concat(parts);
  const out = new Uint8Array(12 + payload.length);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + payload.length, true);
  out.set(payload, 12);
  return out;
}

/* ----------------------------------------------------------------------------------------------
 * GIF
 * --------------------------------------------------------------------------------------------*/

interface GifBlock {
  kind: "extension" | "image" | "trailer";
  label?: number;
  appId?: string;
  start: number;
  end: number;
}

function skipSubBlocks(bytes: Uint8Array, offset: number): number {
  while (offset < bytes.length) {
    const size = bytes[offset];
    offset += 1;
    if (size === 0) return offset;
    offset += size;
  }
  throw new Error("Beschädigte GIF-Struktur.");
}

function gifBlocks(bytes: Uint8Array): { headerEnd: number; blocks: GifBlock[] } {
  if (!hasPrefix(bytes, 0, "GIF8")) throw new Error("Keine gültige GIF-Datei.");
  const packed = bytes[10];
  let offset = 13;
  if (packed & 0x80) offset += 3 * 2 ** ((packed & 0x07) + 1);
  const headerEnd = offset;
  const blocks: GifBlock[] = [];
  while (offset < bytes.length) {
    const introducer = bytes[offset];
    if (introducer === 0x3b) {
      blocks.push({ kind: "trailer", start: offset, end: offset + 1 });
      break;
    }
    if (introducer === 0x21) {
      const label = bytes[offset + 1];
      let appId: string | undefined;
      if (label === 0xff && bytes[offset + 2] === 11) {
        appId = String.fromCharCode(...bytes.subarray(offset + 3, offset + 14));
      }
      const end = skipSubBlocks(bytes, offset + 2);
      blocks.push({ kind: "extension", label, appId, start: offset, end });
      offset = end;
    } else if (introducer === 0x2c) {
      const localPacked = bytes[offset + 9];
      let cursor = offset + 10;
      if (localPacked & 0x80) cursor += 3 * 2 ** ((localPacked & 0x07) + 1);
      cursor += 1; // LZW minimum code size
      const end = skipSubBlocks(bytes, cursor);
      blocks.push({ kind: "image", start: offset, end });
      offset = end;
    } else {
      break; // garbage after the last block – ignore
    }
  }
  return { headerEnd, blocks };
}

const GIF_KEEP_APPS = ["NETSCAPE2.0", "ANIMEXTS1.0"];

/** Concatenates the payload of GIF data sub-blocks starting at `offset`. */
function gifSubBlockData(bytes: Uint8Array, offset: number): Uint8Array {
  const parts: Uint8Array[] = [];
  while (offset < bytes.length) {
    const size = bytes[offset];
    if (size === 0) break;
    parts.push(bytes.subarray(offset + 1, offset + 1 + size));
    offset += 1 + size;
  }
  return concat(parts);
}

function inspectGif(bytes: Uint8Array, report: ImageMetadataReport) {
  const { blocks } = gifBlocks(bytes);
  report.frames = Math.max(1, blocks.filter((block) => block.kind === "image").length);
  for (const block of blocks) {
    if (block.kind !== "extension") continue;
    if (block.label === 0xfe) {
      report.hasComments = true;
      report.findings.push({ category: "other", label: "GIF-Kommentar", value: "Kommentarblock vorhanden" });
    } else if (block.label === 0xff && block.appId) {
      if (block.appId.startsWith("XMP Data")) {
        // Proper sub-block reassembly first, raw bytes second (Adobe writes XMP "raw" with a magic trailer).
        const decoder = new TextDecoder();
        scanXmp(`${decoder.decode(gifSubBlockData(bytes, block.start + 14))}\n${decoder.decode(bytes.subarray(block.start + 14, block.end))}`, report);
      } else if (block.appId.startsWith("ICCRGBG1")) {
        report.hasIcc = true;
      } else if (!GIF_KEEP_APPS.includes(block.appId)) {
        report.findings.push({ category: "software", label: "Programm-Daten", value: block.appId.trim() });
      }
    }
  }
}

function stripGif(bytes: Uint8Array, options: StripOptions): Uint8Array {
  const { headerEnd, blocks } = gifBlocks(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, headerEnd)];
  for (const block of blocks) {
    if (block.kind === "extension") {
      if (block.label === 0xfe) continue;
      if (block.label === 0xff) {
        const id = block.appId ?? "";
        const keep = GIF_KEEP_APPS.includes(id) || (options.keepIcc && id.startsWith("ICCRGBG1"));
        if (!keep) continue;
      }
    }
    parts.push(bytes.subarray(block.start, block.end));
  }
  if (!blocks.some((block) => block.kind === "trailer")) parts.push(Uint8Array.of(0x3b));
  return concat(parts);
}

/* ----------------------------------------------------------------------------------------------
 * Generic container scan (HEIC/AVIF/TIFF)
 * --------------------------------------------------------------------------------------------*/

function indexOfSequence(bytes: Uint8Array, sequence: number[], from = 0): number {
  const first = sequence[0];
  for (let i = bytes.indexOf(first, from); i !== -1 && i <= bytes.length - sequence.length; i = bytes.indexOf(first, i + 1)) {
    let match = true;
    for (let j = 1; j < sequence.length; j += 1) {
      if (bytes[i + j] !== sequence[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

function inspectContainer(bytes: Uint8Array, report: ImageMetadataReport) {
  let index = indexOfSequence(bytes, EXIF_HEADER);
  while (index !== -1) {
    const tiff = index + 6;
    if (hasPrefix(bytes, tiff, "II*\0") || hasPrefix(bytes, tiff, "MM\0*")) {
      readExifBlock(bytes, index, report);
      break;
    }
    index = indexOfSequence(bytes, EXIF_HEADER, index + 1);
  }
  const xmpStart = indexOfSequence(bytes, Array.from("<x:xmpmeta", (c) => c.charCodeAt(0)));
  if (xmpStart !== -1) {
    const xmpEnd = indexOfSequence(bytes, Array.from("</x:xmpmeta>", (c) => c.charCodeAt(0)), xmpStart);
    scanXmp(new TextDecoder().decode(bytes.subarray(xmpStart, xmpEnd === -1 ? xmpStart + 65536 : xmpEnd + 12)), report);
  }
  if (indexOfSequence(bytes, Array.from("colrprof", (c) => c.charCodeAt(0))) !== -1) report.hasIcc = true;
}

/* ----------------------------------------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------------------------------------*/

function dedupe(report: ImageMetadataReport): ImageMetadataReport {
  const seen = new Set<string>();
  report.findings = report.findings.filter((finding) => {
    const key = `${finding.label}|${finding.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return report;
}

export function inspectImageMetadata(bytes: Uint8Array, format: string): ImageMetadataReport {
  const report = emptyReport();
  try {
    switch (format) {
      case "jpeg":
        inspectJpeg(bytes, report);
        break;
      case "png":
        inspectPng(bytes, report);
        break;
      case "webp":
        inspectWebp(bytes, report);
        break;
      case "gif":
        inspectGif(bytes, report);
        break;
      case "tiff":
        readExifBlock(bytes, 0, report);
        break;
      default:
        inspectContainer(bytes, report);
    }
  } catch {
    // Unreadable metadata is reported as "none found" – the strip step still re-validates the file.
  }
  return dedupe(report);
}

/** Formats whose metadata can be removed without re-encoding the image. */
export function supportsLosslessStrip(format: string): boolean {
  return ["jpeg", "png", "webp", "gif"].includes(format);
}

export function stripImageMetadata(bytes: Uint8Array, format: string, options: StripOptions): Uint8Array {
  switch (format) {
    case "jpeg":
      return stripJpeg(bytes, options);
    case "png":
      return stripPng(bytes, options);
    case "webp":
      return stripWebp(bytes, options);
    case "gif":
      return stripGif(bytes, options);
    default:
      throw new Error(`Verlustfreies Entfernen wird für ${format.toUpperCase()} nicht unterstützt.`);
  }
}

/** Number of frames of a GIF/APNG/WebP (1 = still image). */
export function countFrames(bytes: Uint8Array, format: string): number {
  if (!["gif", "png", "webp"].includes(format)) return 1;
  return inspectImageMetadata(bytes, format).frames;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
