import { SourceCode } from "../ui/SourceCode"
import { useQuery } from "@tanstack/react-query"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { FilePreview } from "@meldshell/contracts/ipc"
import type { FileTab } from "../app/tab-store"
import { useTabStore } from "../app/tab-store"
import { FileIcon } from "../ui/FileIcon"
import { Button, ContextMenu, MenuAction, PanelNote } from "../ui/controls"
import { cx, markdownProseClasses, syntaxTokenClasses } from "../ui/styles"
import { useEffect, useMemo, useRef, useState } from "react"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import { RevealFileAction } from "../ui/FileContextActions"
import { ImageContextMenu } from "../ui/ImageContextMenu"
import { segmentClasses, segmentGroupClasses } from "../ui/styles"
import { DelimitedTable } from "./DelimitedTable"
import { JsonTree } from "./JsonTree"
import { isJsonPath, parseDelimited, tableSeparator } from "./preview-model"

function localPath(file: FileTab, source: string): string | null {
  if (!source || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)) return null
  const url = new URL(source, `https://workspace/${file.path}`)
  return decodeURIComponent(url.pathname.slice(1))
}

function PreviewImage({ file, src, alt }: { file: FileTab; src?: string; alt?: string }) {
  const path = localPath(file, src ?? "")
  const query = useQuery({
    queryKey: ["workspace-file", file.workspaceId, file.threadId ?? null, path],
    queryFn: () =>
      window.meldshell.readWorkspaceFile({
        workspaceId: file.workspaceId,
        threadId: file.threadId,
        path: path!,
      }),
    enabled: path !== null,
    retry: false,
  })
  return (
    <img
      src={path === null ? src : query.data?.kind === "image" ? query.data.content : undefined}
      alt={alt ?? ""}
    />
  )
}

async function htmlPreview(file: FileTab, content: string): Promise<string> {
  const document = new DOMParser().parseFromString(content, "text/html")
  document
    .querySelectorAll("script, base, meta[http-equiv], iframe, object, embed")
    .forEach((node) => node.remove())
  const assets = [...document.querySelectorAll("img[src], link[rel=stylesheet][href]")]
  // Limit concurrent IPC reads for documents with many local assets.
  for (let start = 0; start < assets.length; start += 8) {
    await Promise.all(
      assets.slice(start, start + 8).map(async (node) => {
        const attribute = node.tagName === "IMG" ? "src" : "href"
        const path = localPath(file, node.getAttribute(attribute) ?? "")
        if (path === null) return
        const asset = await window.meldshell
          .readWorkspaceFile({ workspaceId: file.workspaceId, threadId: file.threadId, path })
          .catch(() => null)
        if (node.tagName === "IMG" && asset?.kind === "image")
          node.setAttribute("src", asset.content)
        else if (node.tagName === "LINK" && asset?.kind === "text") {
          const style = document.createElement("style")
          style.textContent = asset.content
          node.replaceWith(style)
        }
      }),
    )
  }
  const policy = document.createElement("meta")
  policy.httpEquiv = "Content-Security-Policy"
  policy.content =
    "default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https:; font-src data: https:; form-action 'none'"
  document.head.prepend(policy)
  return `<!doctype html>${document.documentElement.outerHTML}`
}

function HtmlPreview({ file, content }: { file: FileTab; content: string }) {
  const query = useQuery({
    queryKey: ["html-preview", file.workspaceId, file.threadId ?? null, file.path, content],
    queryFn: () => htmlPreview(file, content),
    retry: false,
  })
  if (query.isPending) return <PanelNote>Preparing preview…</PanelNote>
  if (query.isError) return <p role="alert">{query.error.message}</p>
  return (
    <iframe
      title={`Preview of ${file.path}`}
      className="flex-1 w-full border-0 [background:white]"
      sandbox=""
      srcDoc={query.data}
    />
  )
}

/** Turns the host's base64 data URL into a blob, which plays and seeks without a size limit. */
function videoBlob(content: string): Blob {
  const comma = content.indexOf(",")
  const type = content.slice(5, content.indexOf(";"))
  const binary = atob(content.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type })
}

/** Plays a video file from a blob URL that lives as long as the preview shows it. */
function VideoPreview({ file, content }: { file: FileTab; content: string }) {
  const source = useMemo(() => URL.createObjectURL(videoBlob(content)), [content])
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => () => URL.revokeObjectURL(source), [source])
  if (failed === source)
    return <PanelNote role="alert">This video's format cannot be played here.</PanelNote>
  return (
    <div className="flex flex-1 min-h-0 items-center justify-center p-[24px]">
      <video
        key={source}
        src={source}
        controls
        playsInline
        preload="metadata"
        aria-label={`Video: ${file.path}`}
        className="block max-w-full max-h-full rounded-[var(--radius)] bg-black shadow-[0_8px_30px_rgb(0_0_0_/_0.25)]"
        onError={() => setFailed(source)}
      />
    </div>
  )
}

type Structured =
  | { readonly kind: "table"; readonly rows: string[][] }
  | { readonly kind: "tree"; readonly value: unknown }

/** Reads a text file as a table or JSON tree when its extension says it holds one. */
function structuredPreview(path: string, content: string): Structured | null {
  const separator = tableSeparator(path)
  if (separator !== null) {
    const rows = parseDelimited(content, separator)
    return rows.length > 0 ? { kind: "table", rows } : null
  }
  if (!isJsonPath(path)) return null
  try {
    return { kind: "tree", value: JSON.parse(content) }
  } catch {
    return null
  }
}

function structuredSummary(structured: Structured): string | null {
  if (structured.kind !== "table") return null
  const rows = Math.max(0, structured.rows.length - 1)
  const columns = structured.rows.reduce((widest, row) => Math.max(widest, row.length), 0)
  return `${rows.toLocaleString()} row${rows === 1 ? "" : "s"} · ${columns} column${columns === 1 ? "" : "s"}`
}

/** The table or tree view of a structured file, with a switch back to its source. */
function PreviewMode({
  structured,
  showSource,
  onShowSource,
}: {
  structured: Structured
  showSource: boolean
  onShowSource: (showSource: boolean) => void
}) {
  const summary = structuredSummary(structured)
  return (
    <>
      {!showSource && summary && (
        <small className="flex-none text-[var(--text-tertiary)] text-[11.5px] [font-variant-numeric:tabular-nums]">
          {summary}
        </small>
      )}
      <ToggleGroup
        aria-label="Preview mode"
        value={[showSource ? "source" : "rich"]}
        onValueChange={(value) => {
          if (value[0]) onShowSource(value[0] === "source")
        }}
        className={`${segmentGroupClasses} flex-none`}
      >
        <Toggle value="rich" className={segmentClasses}>
          {structured.kind === "table" ? "Table" : "Tree"}
        </Toggle>
        <Toggle value="source" className={segmentClasses}>
          Source
        </Toggle>
      </ToggleGroup>
    </>
  )
}

function StructuredView({ structured }: { structured: Structured }) {
  return structured.kind === "table" ? (
    <DelimitedTable rows={structured.rows} />
  ) : (
    <JsonTree value={structured.value} />
  )
}

/** A text file's table or tree, and whether the reader switched it to show the source. */
function useStructured(path: string, preview: FilePreview | undefined) {
  const structured = useMemo(
    () => (preview?.kind === "text" ? structuredPreview(path, preview.content) : null),
    [path, preview],
  )
  const [showSource, setShowSource] = useState(false)
  const [shownPath, setShownPath] = useState(path)
  if (shownPath !== path) {
    setShownPath(path)
    setShowSource(false)
  }
  return { structured, showSource, setShowSource }
}

const TEXT_KINDS = new Set<FilePreview["kind"]>(["text", "markdown", "html"])

export function FileViewer({ file }: { file: FileTab }) {
  const lineRef = useRef<HTMLSpanElement>(null)
  const openFile = useTabStore((state) => state.openFile)
  const query = useQuery({
    queryKey: ["workspace-file", file.workspaceId, file.threadId ?? null, file.path],
    queryFn: () => window.meldshell.readWorkspaceFile(file),
    retry: false,
    gcTime: 60000,
  })
  const preview = query.data
  const { structured, showSource, setShowSource } = useStructured(file.path, preview)
  // A line reference points into the source, so it always shows as text.
  const rich = structured !== null && !showSource && !file.line
  const lineCount = file.line && preview ? preview.content.split("\n").length : 0
  useEffect(() => {
    if (file.line && preview && lineRef.current?.dataset.path === file.path)
      lineRef.current.scrollIntoView({ block: "center" })
  }, [file.line, file.path, preview])
  return (
    <section
      className="flex flex-col h-full min-h-0 overflow-hidden"
      aria-label={`File viewer: ${file.path}`}
    >
      <ContextMenu
        trigger={
          <header className="flex items-center gap-[8px] [padding:10px_16px] border-b-[1px] border-b-[color:var(--line)] [&_span]:flex-1 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap">
            <FileIcon path={file.path} />
            <span title={file.path}>
              {file.path}
              {file.line ? ` · L${file.line}` : ""}
            </span>
            {structured && !file.line && (
              <PreviewMode
                structured={structured}
                showSource={showSource}
                onShowSource={setShowSource}
              />
            )}
            {file.line && (
              <Button size="sm" onClick={() => openFile(file, file.path)}>
                Clear line reference
              </Button>
            )}
            <Button size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
              Refresh
            </Button>
          </header>
        }
      >
        <MenuAction onClick={() => void navigator.clipboard.writeText(file.path)}>
          Copy file path
        </MenuAction>
        <RevealFileAction scope={file} path={file.path} />
        {preview && TEXT_KINDS.has(preview.kind) && (
          <MenuAction onClick={() => void navigator.clipboard.writeText(preview.content)}>
            Copy file contents
          </MenuAction>
        )}
        <MenuAction onClick={() => void query.refetch()}>Refresh file</MenuAction>
      </ContextMenu>
      {query.isPending && <PanelNote role="status">Loading file…</PanelNote>}
      {query.isError && <PanelNote role="alert">{query.error.message}</PanelNote>}
      {preview?.kind === "unsupported" && <PanelNote>{preview.content}</PanelNote>}
      {preview?.kind === "html" && <HtmlPreview file={file} content={preview.content} />}
      {preview?.kind === "video" && <VideoPreview file={file} content={preview.content} />}
      {rich && <StructuredView structured={structured} />}
      {preview?.kind === "image" && (
        <div className="flex-1 overflow-auto p-[24px] text-center [&_img]:max-w-full [&_img]:h-auto overflow-y-auto [scrollbar-gutter:stable]">
          <ImageContextMenu
            source={preview.content}
            name={file.path.split("/").at(-1)}
            trigger={<img src={preview.content} alt={file.path} />}
          />
        </div>
      )}
      {preview?.kind === "text" && !rich && (
        <ContextMenu
          trigger={
            <pre
              className={fileSourceClasses}
              tabIndex={0}
              aria-label={file.line ? `Source at line ${file.line}` : "Source"}
            >
              <span className="relative inline-block min-w-full">
                {file.line && file.line <= lineCount && (
                  <span
                    ref={lineRef}
                    className="absolute left-[0] right-[0] bg-[var(--surface-active)] [outline:1px_solid_var(--line-strong)] pointer-events-none"
                    data-path={file.path}
                    aria-hidden="true"
                    style={{
                      top: `${(file.line - 1) * 1.6}em`,
                      height: `${(Math.min(file.endLine ?? file.line, lineCount) - file.line + 1) * 1.6}em`,
                    }}
                  />
                )}
                <SourceCode path={file.path} text={preview.content} />
              </span>
            </pre>
          }
        >
          <MenuAction
            onClick={() =>
              void navigator.clipboard.writeText(
                window.getSelection()?.toString() || preview.content,
              )
            }
          >
            Copy selection or file
          </MenuAction>
          <MenuAction onClick={() => void navigator.clipboard.writeText(file.path)}>
            Copy file path
          </MenuAction>
          <MenuAction onClick={() => void query.refetch()}>Refresh file</MenuAction>
        </ContextMenu>
      )}
      {preview?.kind === "markdown" && (
        <div className={eventMarkdownClasses}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => <PreviewImage file={file} src={src} alt={alt} />,
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    const path = localPath(file, href ?? "")
                    if (path !== null) {
                      event.preventDefault()
                      openFile(file, path)
                    }
                  }}
                >
                  {children}
                </a>
              ),
            }}
          >
            {preview.content}
          </ReactMarkdown>
        </div>
      )}
    </section>
  )
}

const fileSourceClasses = cx(
  syntaxTokenClasses,
  [
    "flex-1 overflow-auto m-0 p-[20px]",
    "[font-family:var(--font-mono)] text-[13px] leading-[1.6] [tab-size:4] overflow-y-auto",
    "[scrollbar-gutter:stable]",
  ].join(" "),
)

const eventMarkdownClasses = cx(
  "flex-1 overflow-auto p-[24px] [overflow-wrap:anywhere] text-[var(--text-secondary)]",
  "text-[length:var(--transcript-font-size,14px)] leading-[1.65] whitespace-pre-wrap",
  "[&_code:not(pre_code)]:[padding:1px_4px] [&_code:not(pre_code)]:border-[1px]",
  "[&_code:not(pre_code)]:border-[color:var(--line-subtle)] [&_code:not(pre_code)]:rounded-[var(--radius-sm)]",
  "[&_code:not(pre_code)]:bg-[var(--surface-hover)] [&_code:not(pre_code)]:[font-family:var(--font-mono)]",
  "[&_code:not(pre_code)]:text-[0.9em] overflow-y-auto [scrollbar-gutter:stable]",
  markdownProseClasses,
)
