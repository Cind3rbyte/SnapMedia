import { Check, CloudOff, Cpu, RefreshCw, Scissors, ShieldCheck, Shrink, X, Zap } from "lucide-react";
import { MediaWorkspace } from "@/components/workspace/media-workspace";

const TOOLS = [
  {
    icon: Shrink,
    title: "Chat- & Discord-Komprimierer",
    text: "Presets für „Unter 10 MB (Discord Free)“, „Unter 5 MB (E-Mail)“ und maximale Web-Kompression. Bitrate, Auflösung und Bildrate werden automatisch berechnet – und das Ergebnis wird geprüft.",
  },
  {
    icon: RefreshCw,
    title: "Format-Konverter",
    text: "HEIC (iPhone), WebP, SVG, AVIF, PNG & JPG in saubere JPG/PNG/WebP. Tonspur aus MP4, MOV, MKV & WebM als MP3 oder verlustarm als AAC extrahieren.",
  },
  {
    icon: Scissors,
    title: "Video-Cutter & Trimmer",
    text: "Visuelle Timeline mit Vorschaubildern, zwei Griffen und Zeiteingabe auf die Zehntelsekunde. Export verlustfrei in Sekunden oder framegenau.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy-Cleaner (EXIF-Strip)",
    text: "Entfernt GPS-Koordinaten, Kameramodell, Seriennummern, Aufnahmezeit und Software-Infos aus Fotos & Videos – bei JPG/PNG/WebP/GIF ohne jeden Qualitätsverlust.",
  },
];

const COMPARISON: Array<{ label: string; snap: string | boolean; others: string | boolean }> = [
  { label: "Dateien werden hochgeladen", snap: false, others: true },
  { label: "Arbeitet ohne Internet weiter, sobald die Seite geladen ist", snap: true, others: false },
  { label: "Konto / E-Mail nötig für mehr Umfang", snap: false, others: "teilweise" },
  { label: "Tageslimits & Größenlimits im Gratis-Tarif", snap: "nur dein Gerät", others: true },
  { label: "Warteschlange auf fremden Servern", snap: false, others: true },
  { label: "Quelloffen & überprüfbar", snap: true, others: false },
  { label: "Kosten", snap: "kostenlos", others: "Abo für Vollumfang" },
];

const FAQ = [
  {
    q: "Werden meine Dateien wirklich nicht hochgeladen?",
    a: "Ja. SnapMedia ist eine statische Web-App: FFmpeg, libheif und die Bildverarbeitung laufen als WebAssembly bzw. Canvas direkt in deinem Browser. Eine Content-Security-Policy verbietet der Seite technisch jede Verbindung zu fremden Servern – du kannst es im Netzwerk-Tab deiner Entwicklertools nachprüfen.",
  },
  {
    q: "Warum dauert die erste Video-Bearbeitung etwas länger?",
    a: "Beim ersten Video lädt dein Browser einmalig die FFmpeg-Engine (ca. 32 MB) von dieser Website. Danach liegt sie im Cache, und alles startet sofort.",
  },
  {
    q: "Wie garantiert der Discord-Preset die 10 MB?",
    a: "SnapMedia berechnet aus der Videolänge die maximal mögliche Bitrate (inklusive Ton und Container-Overhead), wählt passende Auflösung und Bildrate und prüft die fertige Datei. Liegt sie doch knapp darüber, wird automatisch mit angepasster Bitrate nachkodiert.",
  },
  {
    q: "Welche Browser werden unterstützt?",
    a: "Aktuelle Versionen von Chrome, Edge, Firefox und Safari (Desktop & Mobil). Mit aktivierter Cross-Origin-Isolation nutzt SnapMedia Multi-Threading für deutlich schnellere Videoverarbeitung.",
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-4 text-success" aria-label="Ja" />;
  if (value === false) return <X className="mx-auto size-4 text-muted-foreground" aria-label="Nein" />;
  return <span className="text-xs">{value}</span>;
}

export default function HomePage() {
  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
        <section className="mx-auto max-w-3xl space-y-5 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-soft px-4 py-1.5 text-sm font-medium text-success">
            🔒 100% Lokal & Privat: Deine Dateien verlassen niemals dein Gerät.
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Medien komprimieren, konvertieren & schneiden.{" "}
            <span className="bg-gradient-to-r from-violet-600 to-pink-500 bg-clip-text text-transparent dark:from-violet-400 dark:to-pink-400">
              Direkt im Browser.
            </span>
          </h1>
          <p className="text-lg text-pretty text-muted-foreground">
            Die kostenlose, private Alternative zu Convertio, Ezgif und CloudConvert. Videos unter 10 MB für Discord, HEIC zu
            JPG, Tonspur als MP3, Clips schneiden und GPS-Daten entfernen – ohne Upload, ohne Konto, ohne Wasserzeichen.
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <CloudOff className="size-4 text-primary" aria-hidden /> Kein Server-Upload
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Cpu className="size-4 text-primary" aria-hidden /> WebAssembly & Web Worker
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Zap className="size-4 text-primary" aria-hidden /> Kostenlos & ohne Limits
            </li>
          </ul>
        </section>

        <div className="mt-10">
          <MediaWorkspace />
        </div>

        <section className="mt-20 space-y-6" aria-labelledby="tools-heading">
          <div className="space-y-2 text-center">
            <h2 id="tools-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Vier Werkzeuge. Null Uploads.
            </h2>
            <p className="text-muted-foreground">Zieh eine Datei auf die Fläche – SnapMedia zeigt dir automatisch die passenden Werkzeuge.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => (
              <article key={tool.title} className="card-surface space-y-3 rounded-2xl p-5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <tool.icon className="size-5" aria-hidden />
                </div>
                <h3 className="font-semibold">{tool.title}</h3>
                <p className="text-sm text-muted-foreground">{tool.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="datenschutz" className="mt-20 scroll-mt-24 space-y-6" aria-labelledby="privacy-heading">
          <div className="space-y-2 text-center">
            <h2 id="privacy-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Datenschutz, der technisch erzwungen ist
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Klassische Online-Konverter laden deine Fotos und Videos auf ihre Server. SnapMedia rechnet ausschließlich auf
              deinem Gerät – deine privaten Aufnahmen bleiben bei dir.
            </p>
          </div>
          <div className="card-surface overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">Vergleich SnapMedia mit Cloud-Konvertern</caption>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Merkmal
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-semibold text-primary">
                    SnapMedia
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">
                    Cloud-Konverter
                    <span className="block text-xs font-normal text-muted-foreground">z. B. CloudConvert, Convertio</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      {row.label}
                    </th>
                    <td className="px-4 py-3 text-center">
                      <Cell value={row.snap} />
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      <Cell value={row.others} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-3xl space-y-4" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Häufige Fragen
          </h2>
          <div className="space-y-2">
            {FAQ.map((entry) => (
              <details key={entry.q} className="card-surface group rounded-xl px-5 py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {entry.q}
                    <span className="text-muted-foreground transition group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{entry.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
