import { SourceCode } from "../ui/SourceCode"

import { useQuery } from "@tanstack/react-query"

import ReactMarkdown from "react-markdown"

import remarkGfm from "remark-gfm"

import type { FileTab } from "../app/tab-store"

import { useTabStore } from "../app/tab-store"

import { FileIcon } from "../ui/FileIcon"

import { Button } from "../ui/controls"

import { useEffect, useRef } from "react"

function localPath(file: FileTab, source: string): string | null {
  if (!source || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)) return null

  const url = new URL(source, `https://workspace/${file.path}`)

  return decodeURIComponent(url.pathname.slice(1))
}

function PreviewImage({ file, src, alt }: { file: FileTab; src?: string; alt?: string }) {
  const path = localPath(file, src ?? "")

  const query = useQuery({
    queryKey: ["workspace-file", file.workspaceId, path],

    queryFn: () =>
      window.meldshell.readWorkspaceFile({ workspaceId: file.workspaceId, path: path! }),

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

          .readWorkspaceFile({ workspaceId: file.workspaceId, path })

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
    queryKey: ["html-preview", file.workspaceId, file.path, content],

    queryFn: () => htmlPreview(file, content),

    retry: false,
  })

  if (query.isPending)
    return (
      <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
        Preparing preview…
      </p>
    )

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
    queryKey: ["workspace-file", file.workspaceId, file.path],

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
          <Button size="sm" onClick={() => openFile(file.workspaceId, file.path)}>
            Clear line reference
          </Button>
        )}
        <Button size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </header>
      {query.isPending && (
        <p
          className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
          role="status"
        >
          Loading file…
        </p>
      )}
      {query.isError && (
        <p
          className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
          role="alert"
        >
          {query.error.message}
        </p>
      )}
      {preview?.kind === "unsupported" && (
        <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
          {preview.content}
        </p>
      )}
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

                      openFile(file.workspaceId, path)
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

const eventMarkdownClasses = [
  "flex-1 overflow-auto p-[24px] [&_img]:max-w-full [overflow-wrap:anywhere]",
  "text-[var(--text-secondary)] text-[length:var(--transcript-font-size,14px)] leading-[1.65]",
  "whitespace-pre-wrap event-markdown whitespace-normal [&_>_:first-child]:mt-[0]",
  "[&_>_:last-child]:mb-[0] [&_p]:[margin:0_0_0.7em] [&_a]:text-[var(--color-info)]",
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
  "[&_.katex-display]:overflow-y-hidden overflow-y-auto [scrollbar-gutter:stable]",
].join(" ")
