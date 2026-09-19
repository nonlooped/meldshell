import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Button, AppDialog } from "./controls"
import { SourceCode } from "./SourceCode"
import { ChangeDiff } from "./ChangeDiff"
import { FileIcon } from "./FileIcon"
import { tableDelimited } from "./markdown-model"
import { copyableText } from "./MarkdownTools"
import { createContext } from "react"

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
    return <p className="markdown-notice">Diagram will render when the response finishes.</p>
  if (text.length > 50_000)
    return <p className="markdown-notice">Diagram is too large to preview.</p>
  return result?.text === text ? (
    result.url ? (
      <img className="markdown-diagram" src={result.url} alt="Generated diagram" />
    ) : (
      <p role="status">{result.error}</p>
    )
  ) : (
    <p className="markdown-notice">Rendering diagram…</p>
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
    <section className="markdown-code" aria-label={path || language || "Code block"}>
      <header>
        {path && <FileIcon path={path} size={14} />}
        <span>{path || language || "Text"}</span>
        <CopyButton value={text} label="Copy code" />
      </header>
      {diagram && <Diagram text={text} />}
      {diff && !streaming && !query ? (
        <ChangeDiff path={path} patch={text} />
      ) : (
        <div className="markdown-code-scroll" data-folded={(long && !showAll) || undefined}>
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
    <div className="markdown-table-container">
      <div className="markdown-toolbar">
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
          <div className="markdown-table-expanded event-markdown">
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
        className="markdown-quote"
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
      <div className="markdown-lightbox">
        {image && (
          <img
            src={image.src}
            alt={image.alt}
            style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
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
    <div className="tool-images">
      {gallery.map((image, i) => (
        <figure key={`${i}:${image.src}`} className="tool-image">
          <figcaption>Image result{images.length > 1 ? ` ${i + 1}` : ""}</figcaption>
          <button
            type="button"
            className="markdown-image-button"
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
