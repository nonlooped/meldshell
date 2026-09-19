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
import { SourceCode } from "./SourceCode"
import { ChangeDiff } from "./ChangeDiff"
import { FileIcon } from "./FileIcon"
import { tableDelimited } from "./markdown-model"
import { copyableText } from "./MarkdownTools"

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
      <span aria-live="polite">{status || label}</span>
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
  return (
    <AppDialog
      open={!!image}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={image?.alt || "Image"}
      actions={
        <>
          <Button
            disabled={index <= 0}
            onClick={() => {
              setZoom(1)
              onIndex(index - 1)
            }}
          >
            Previous
          </Button>
          <span>
            {index + 1} / {images.length}
          </span>
          <Button
            disabled={index >= images.length - 1}
            onClick={() => {
              setZoom(1)
              onIndex(index + 1)
            }}
          >
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
          className="min-w-0 m-0 [&_figcaption]:mb-[8px] [&_figcaption]:text-[var(--text-secondary)] [&_figcaption]:text-[11px] [&_figcaption]:font-semibold [&_img]:block [&_img]:max-w-full [&_img]:max-h-[600px] [&_img]:object-contain [&_img]:rounded-[var(--radius)]"
        >
          <figcaption>Image result{images.length > 1 ? ` ${i + 1}` : ""}</figcaption>
          <button
            type="button"
            className="markdown-image-button inline-block p-0 border-0 bg-transparent cursor-zoom-in max-w-full [&:focus-visible]:[outline:2px_solid_var(--accent)] [&:focus-visible]:[outline-offset:2px]"
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

const eventMarkdownClasses = [
  "markdown-table-expanded [&_.markdown-table]:max-h-[70vh] event-markdown whitespace-normal",
  "[&_>_:first-child]:mt-[0] [&_>_:last-child]:mb-[0] [&_p]:[margin:0_0_0.7em]",
  "[&_a]:text-[var(--color-info)]",
  "[&_a]:[text-decoration-color:color-mix(in_srgb,_var(--color-info)_50%,_transparent)]",
  "[&_a]:[text-underline-offset:3px] [&_code:not(pre_code)]:[padding:1px_4px]",
  "[&_code:not(pre_code)]:border-[1px] [&_code:not(pre_code)]:border-[color:var(--line-subtle)]",
  "[&_code:not(pre_code)]:rounded-[var(--radius-sm)] [&_code:not(pre_code)]:bg-[var(--surface-hover)]",
  "[&_code:not(pre_code)]:[font-family:var(--font-mono)] [&_code:not(pre_code)]:text-[0.9em]",
  "[&_.markdown-table]:max-w-full [&_.markdown-table]:overflow-x-auto [&_.markdown-table]:[margin:1em_0]",
  "[&_.markdown-table]:border-[1px] [&_.markdown-table]:border-[color:var(--line)] [&_.markdown-table]:rounded-[var(--radius)]",
  "[&_.markdown-table]:max-h-[400px] [&_.markdown-table]:overflow-auto [&_.markdown-table]:mt-[0]",
  "[&_.markdown-table:focus-visible]:[outline:1px_solid_var(--accent)]",
  "[&_.markdown-table:focus-visible]:[outline-offset:2px] [&_table]:w-full",
  "[&_table]:[border-collapse:collapse] [&_table]:[overflow-wrap:normal] [&_th]:min-w-[10rem]",
  "[&_th]:[padding:9px_12px] [&_th]:border-b-[1px] [&_th]:border-b-[color:var(--line)] [&_th]:[vertical-align:top]",
  "[&_th]:bg-[var(--surface-hover)] [&_th]:text-left [&_th]:font-semibold [&_td]:min-w-[10rem]",
  "[&_td]:[padding:9px_12px] [&_td]:border-b-[1px] [&_td]:border-b-[color:var(--line)] [&_td]:[vertical-align:top]",
  "[&_th:first-child]:min-w-auto [&_td:first-child]:min-w-auto [&_tr:last-child_td]:border-b-0",
  "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:p-[12px] [&_pre]:border-[1px] [&_pre]:border-[color:var(--line)]",
  "[&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--surface-hover)] [&_pre]:whitespace-pre",
  "[&_pre]:[overflow-wrap:normal] [&_pre_code]:[font-family:var(--font-mono)] [&_pre_code]:text-[0.9em]",
  "[&_blockquote]:[margin:1em_0] [&_blockquote]:pl-[12px]",
  "[&_blockquote]:border-l-[2px] [&_blockquote]:border-l-[color:var(--line-strong)] [&_blockquote]:text-[var(--text-secondary)]",
  "[&_img]:max-w-full [&_img]:h-auto [&_.contains-task-list]:[list-style:none]",
  "[&_.contains-task-list]:pl-[1.5em] [&_hr]:border-0 [&_hr]:border-t-[1px] [&_hr]:border-t-[color:var(--line)]",
  "[&_hr]:[margin:1.5em_0] [&_.markdown-code-scroll_pre]:flex-1",
  "[&_.markdown-code-scroll_pre]:overflow-visible [&_.markdown-code-scroll_pre]:border-0",
  "[&_.markdown-code-scroll_pre]:rounded-[0] [&_.markdown-code-scroll_pre]:m-0",
  "[&_.markdown-code-scroll_pre]:bg-transparent [&_.markdown-code-scroll_pre]:leading-[1.65]",
  "[&_.markdown-code-scroll_pre]:text-[0.9em] [&_.markdown-code-scroll_pre_code]:text-[inherit]",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:sticky",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:left-[0]",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:flex-none",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:text-[var(--text-tertiary)]",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:text-right",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:bg-[var(--surface-menu)]",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:select-none [&_.markdown-table_th]:sticky",
  "[&_.markdown-table_th]:top-[0] [&_.markdown-table_th]:z-[1]",
  "[&_.markdown-table_th]:bg-[var(--surface-menu)] [&_mark]:text-[var(--text-primary)]",
  "[&_mark]:[background:color-mix(in_srgb,_var(--color-modified)_35%,_transparent)]",
  "[&_mark[data-current]]:[outline:2px_solid_var(--color-modified)] [&_.katex-display]:overflow-x-auto",
  "[&_.katex-display]:overflow-y-hidden",
].join(" ")
