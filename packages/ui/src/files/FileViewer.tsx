import { SourceCode } from "../ui/SourceCode"
import { useQuery } from "@tanstack/react-query"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { FileTab } from "../app/tab-store"
import { useTabStore } from "../app/tab-store"
import { FileIcon } from "../ui/FileIcon"
import { Button, PanelNote } from "../ui/controls"
import { cx, markdownProseClasses } from "../ui/styles"
import { useEffect, useRef } from "react"

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
      <header className="flex items-center gap-[8px] [padding:10px_16px] border-b-[1px] border-b-[color:var(--line)] [&_span]:flex-1 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap">
        <FileIcon path={file.path} />
        <span title={file.path}>
          {file.path}
          {file.line ? ` · L${file.line}` : ""}
        </span>
        {file.line && (
          <Button size="sm" onClick={() => openFile(file, file.path)}>
            Clear line reference
          </Button>
        )}
        <Button size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </header>
      {query.isPending && <PanelNote role="status">Loading file…</PanelNote>}
      {query.isError && <PanelNote role="alert">{query.error.message}</PanelNote>}
      {preview?.kind === "unsupported" && <PanelNote>{preview.content}</PanelNote>}
      {preview?.kind === "html" && <HtmlPreview file={file} content={preview.content} />}
      {preview?.kind === "image" && (
        <div className="flex-1 overflow-auto p-[24px] text-center [&_img]:max-w-full [&_img]:h-auto overflow-y-auto [scrollbar-gutter:stable]">
          <img src={preview.content} alt={file.path} />
        </div>
      )}
      {preview?.kind === "text" && (
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

const fileSourceClasses = [
  "[&_.token.comment]:text-[var(--text-tertiary)] [&_.token.prolog]:text-[var(--text-tertiary)]",
  "[&_.token.doctype]:text-[var(--text-tertiary)] [&_.token.keyword]:text-[var(--color-renamed)]",
  "[&_.token.tag]:text-[var(--color-renamed)] [&_.token.boolean]:text-[var(--color-renamed)]",
  "[&_.token.string]:text-[var(--color-added)] [&_.token.attr-value]:text-[var(--color-added)]",
  "[&_.token.number]:text-[var(--color-modified)] [&_.token.function]:text-[var(--color-modified)]",
  "[&_.token.class-name]:text-[var(--color-modified)] [&_.token.property]:text-[var(--color-info)]",
  "[&_.token.attr-name]:text-[var(--color-info)] flex-1 overflow-auto m-0 p-[20px]",
  "[font-family:var(--font-mono)] text-[13px] leading-[1.6] [tab-size:4] overflow-y-auto",
  "[scrollbar-gutter:stable]",
].join(" ")

const eventMarkdownClasses = cx(
  "flex-1 overflow-auto p-[24px] [overflow-wrap:anywhere] text-[var(--text-secondary)]",
  "text-[length:var(--transcript-font-size,14px)] leading-[1.65] whitespace-pre-wrap",
  "[&_code:not(pre_code)]:[padding:1px_4px] [&_code:not(pre_code)]:border-[1px]",
  "[&_code:not(pre_code)]:border-[color:var(--line-subtle)] [&_code:not(pre_code)]:rounded-[var(--radius-sm)]",
  "[&_code:not(pre_code)]:bg-[var(--surface-hover)] [&_code:not(pre_code)]:[font-family:var(--font-mono)]",
  "[&_code:not(pre_code)]:text-[0.9em] overflow-y-auto [scrollbar-gutter:stable]",
  markdownProseClasses,
)
