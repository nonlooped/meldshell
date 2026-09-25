import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  createContext,
} from "react"
import { Button, AppDialog } from "./controls"
import { Swap } from "./motion"
import { SourceCode } from "./SourceCode"
import { ChangeDiff } from "./ChangeDiff"
import { FileIcon } from "./FileIcon"
import { tableDelimited } from "./markdown-model"
import { copyableText } from "./MarkdownTools"
import { cx, markdownInlineClasses, markdownProseClasses } from "./styles"

export const MarkdownStreaming = createContext(false)
export const MarkdownSearch = createContext("")

function CopyButton({
  value,
  label = "Copy",
  preserveSelection = false,
}: {
  value: string | (() => string)
  label?: string
  preserveSelection?: boolean
}) {
  const [status, setStatus] = useState("")
  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(""), 2000)
    return () => clearTimeout(timer)
  }, [status])
  return (
    <Button
      size="sm"
      variant="ghost"
      onMouseDown={(event) => {
        if (preserveSelection) event.preventDefault()
      }}
      onClick={async () => {
        try {
          const text = typeof value === "function" ? value() : value
          if (preserveSelection && !text) {
            setStatus("Select text first")
            return
          }
          await navigator.clipboard.writeText(text)
          setStatus("Copied")
        } catch {
          setStatus("Copy failed")
        }
      }}
    >
      <span aria-live="polite">
        <Swap id={status || label} className="block">
          {status || label}
        </Swap>
      </span>
    </Button>
  )
}

let diagramSequence = 0
let mermaidModule: Promise<typeof import("mermaid")> | undefined
function loadMermaid() {
  mermaidModule ??= import("mermaid").then((module) => {
    module.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "neutral",
      look: "classic",
      layout: "dagre",
      fontFamily: "Segoe UI",
      flowchart: { htmlLabels: false },
    })
    return module
  })
  return mermaidModule
}

function Diagram({ text }: { text: string }) {
  const streaming = useContext(MarkdownStreaming)
  const [result, setResult] = useState<{ text: string; url?: string; error?: string }>()
  useEffect(() => {
    if (streaming || text.length > 50_000) return
    let cancelled = false
    void loadMermaid()
      .then(async (module) => {
        const { svg } = await module.default.render(`markdown-diagram-${++diagramSequence}`, text)
        if (!cancelled)
          setResult({ text, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` })
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            text,
            error: "Diagram could not be rendered. The source is available below.",
          })
      })
    return () => {
      cancelled = true
    }
  }, [text, streaming])
  if (streaming)
    return (
      <p className="p-[10px] text-[var(--text-secondary)] text-[0.85em]">
        Diagram will render when the response finishes.
      </p>
    )
  if (text.length > 50_000)
    return (
      <p className="p-[10px] text-[var(--text-secondary)] text-[0.85em]">
        Diagram is too large to preview.
      </p>
    )
  return result?.text === text ? (
    result.url ? (
      <img
        className="block [margin:12px_auto] p-[12px] [background:#fff]"
        src={result.url}
        alt="Generated diagram"
      />
    ) : (
      <p role="status">{result.error}</p>
    )
  ) : (
    <p className="p-[10px] text-[var(--text-secondary)] text-[0.85em]">Rendering diagram…</p>
  )
}

export function CodeBlock({
  text,
  language = "",
  path = "",
  startLine = 1,
  children,
}: {
  text: string
  language?: string
  path?: string
  startLine?: number
  children?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const query = useContext(MarkdownSearch)
  const streaming = useContext(MarkdownStreaming)
  const lines = text.replace(/\n$/, "").split("\n")
  const long = lines.length > 24
  const showAll = expanded || !!query
  const diff = /^(diff|patch)$/.test(language)
  const diagram = language === "mermaid"
  return (
    <section className={markdownCodeClasses} aria-label={path || language || "Code block"}>
      <header>
        {path && <FileIcon path={path} size={14} />}
        <span>{path || language || "Text"}</span>
        <CopyButton value={text} label="Copy code" />
      </header>
      {diagram && <Diagram text={text} />}
      {diff && !streaming && !query ? (
        <ChangeDiff path={path} patch={text} />
      ) : (
        <div
          className="markdown-code-scroll flex max-h-[65vh] overflow-auto [&[data-folded]]:max-h-[300px] [&[data-folded]]:overflow-y-hidden"
          data-folded={(long && !showAll) || undefined}
        >
          <pre className="markdown-line-numbers" aria-hidden="true">
            {lines.map((_, i) => startLine + i).join("\n")}
          </pre>
          <pre tabIndex={0}>
            {query ? (
              children
            ) : (
              <SourceCode text={text} path={path} language={language || undefined} />
            )}
          </pre>
        </div>
      )}
      {long && !(diff && !streaming && !query) && (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={showAll}
          onClick={() => setExpanded(!expanded)}
          disabled={!!query}
        >
          {showAll ? "Show less" : `Show all ${lines.length} lines`}
        </Button>
      )}
    </section>
  )
}

export function MarkdownTable({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLTableElement>(null)
  const [expanded, setExpanded] = useState(false)
  const tableText = (separator: string) =>
    tableDelimited(
      Array.from(ref.current?.rows ?? []).map((row) =>
        Array.from(row.cells).map((cell) => copyableText(cell, "")),
      ),
      separator,
    )
  return (
    <div className="[&[data-expanded]_.markdown-table]:max-h-[80vh]">
      <div className="flex items-center flex-wrap gap-[4px] [margin:4px_0_8px] [font-family:var(--font-text)] [&_.button]:text-[11px] [&_.text-input]:flex-1 [&_.text-input]:min-w-[120px]">
        <CopyButton label="Copy CSV" value={() => tableText(",")} />
        <CopyButton label="Copy TSV" value={() => tableText("\t")} />
        <Button
          size="sm"
          variant="ghost"
          aria-haspopup="dialog"
          onClick={() => setExpanded(!expanded)}
        >
          Expand table
        </Button>
      </div>
      <div className="markdown-table" role="region" aria-label="Markdown table" tabIndex={0}>
        <table ref={ref}>{children}</table>
      </div>
      {expanded && (
        <AppDialog
          open={expanded}
          onOpenChange={setExpanded}
          title="Table"
          actions={
            <>
              <CopyButton label="Copy CSV" value={() => tableText(",")} />
              <CopyButton label="Copy TSV" value={() => tableText("\t")} />
              <Button onClick={() => setExpanded(false)}>Close</Button>
            </>
          }
        >
          <div className={eventMarkdownClasses}>
            <div className="markdown-table" tabIndex={0} role="region" aria-label="Expanded table">
              <table>{children}</table>
            </div>
          </div>
        </AppDialog>
      )}
    </div>
  )
}

export function FoldedQuote({ children, length }: { children: ReactNode; length: number }) {
  const [expanded, setExpanded] = useState(false)
  const query = useContext(MarkdownSearch)
  return (
    <div>
      <blockquote
        className="[&[data-folded]]:max-h-[180px] [&[data-folded]]:overflow-hidden"
        data-folded={(length > 1200 && !expanded && !query) || undefined}
      >
        {children}
      </blockquote>
      {length > 1200 && (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={expanded || !!query}
          disabled={!!query}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show full quote"}
        </Button>
      )}
    </div>
  )
}

export function ImageLightbox({
  images,
  index,
  onClose,
  onIndex,
}: {
  images: readonly { src: string; alt: string }[]
  index: number
  onClose: () => void
  onIndex: (index: number) => void
}) {
  const [zoom, setZoom] = useState(1)
  const id = useId()
  const image = images[index]
  const go = (next: number) => {
    if (next < 0 || next >= images.length) return
    setZoom(1)
    onIndex(next)
  }
  // Arrow keys page through images, except while the zoom slider has focus and uses them itself.
  const open = image !== undefined
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === "ArrowLeft") go(index - 1)
      else if (event.key === "ArrowRight") go(index + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  return (
    <AppDialog
      open={!!image}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={image?.alt || "Image"}
      actions={
        <>
          <Button disabled={index <= 0} onClick={() => go(index - 1)}>
            Previous
          </Button>
          <span>
            {index + 1} / {images.length}
          </span>
          <Button disabled={index >= images.length - 1} onClick={() => go(index + 1)}>
            Next
          </Button>
          <label htmlFor={id}>Zoom</label>
          <input
            id={id}
            type="range"
            min="1"
            max="4"
            step="0.25"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="markdown-lightbox max-h-[65vh] overflow-auto">
        {image && (
          <img
            src={image.src}
            alt={image.alt}
            className="max-w-none!"
            style={{ width: `${zoom * 100}%` }}
          />
        )}
      </div>
    </AppDialog>
  )
}

export function ToolImageGallery({ images }: { images: readonly string[] }) {
  const [index, setIndex] = useState<number>()
  const gallery = images.map((src, i) => ({ src, alt: `Tool result ${i + 1}` }))
  return (
    <div className="grid gap-[12px] min-w-0">
      {gallery.map((image, i) => (
        <figure
          key={`${i}:${image.src}`}
          className="min-w-0 m-0 [&_figcaption]:mb-[8px] [&_figcaption]:text-[var(--text-secondary)] [&_figcaption]:text-[11px] [&_figcaption]:font-medium [&_img]:block [&_img]:max-w-full [&_img]:max-h-[600px] [&_img]:object-contain [&_img]:rounded-[var(--radius)]"
        >
          <figcaption>Image result{images.length > 1 ? ` ${i + 1}` : ""}</figcaption>
          <button
            type="button"
            className="markdown-image-button inline-block p-0 border-0 bg-transparent cursor-zoom-in max-w-full [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]"
            aria-label={`Enlarge ${image.alt}`}
            onClick={() => setIndex(i)}
          >
            <img src={image.src} alt={image.alt} />
          </button>
        </figure>
      ))}
      {index !== undefined && (
        <ImageLightbox
          images={gallery}
          index={index}
          onClose={() => setIndex(undefined)}
          onIndex={setIndex}
        />
      )}
    </div>
  )
}

const markdownCodeClasses = [
  "[&_.token.comment]:text-[var(--text-tertiary)] [&_.token.prolog]:text-[var(--text-tertiary)]",
  "[&_.token.doctype]:text-[var(--text-tertiary)] [&_.token.keyword]:text-[var(--color-renamed)]",
  "[&_.token.tag]:text-[var(--color-renamed)] [&_.token.boolean]:text-[var(--color-renamed)]",
  "[&_.token.string]:text-[var(--color-added)] [&_.token.attr-value]:text-[var(--color-added)]",
  "[&_.token.number]:text-[var(--color-modified)] [&_.token.function]:text-[var(--color-modified)]",
  "[&_.token.class-name]:text-[var(--color-modified)] [&_.token.property]:text-[var(--color-info)]",
  "[&_.token.attr-name]:text-[var(--color-info)] [margin:12px_0] border-[1px] border-[color:var(--line)]",
  "rounded-[var(--radius)] overflow-hidden [&_>_header]:flex [&_>_header]:items-center",
  "[&_>_header]:gap-[6px] [&_>_header]:[padding:5px_10px] [&_>_header]:bg-[var(--surface-hover)]",
  "[&_>_header]:border-b-[1px] [&_>_header]:border-b-[color:var(--line)] [&_>_header]:text-[var(--text-secondary)]",
  "[&_>_header]:[font:12px_var(--font-mono)] [&_>_header_>_span]:flex-1",
  "[&_>_header_>_span]:[overflow-wrap:anywhere]",
].join(" ")

const eventMarkdownClasses = cx(
  "markdown-table-expanded [&_.markdown-table]:max-h-[70vh]",
  markdownInlineClasses,
  markdownProseClasses,
)
