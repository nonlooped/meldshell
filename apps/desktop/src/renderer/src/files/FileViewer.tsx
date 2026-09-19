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

  if (query.isPending) return <p className="git-notice">Preparing preview…</p>

  if (query.isError) return <p role="alert">{query.error.message}</p>

  return (
    <iframe
      title={`Preview of ${file.path}`}
      className="file-html"
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
    <section className="file-viewer" aria-label={`File viewer: ${file.path}`}>
      <header className="file-viewer-header">
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
        <p className="git-notice" role="status">
          Loading file…
        </p>
      )}
      {query.isError && (
        <p className="git-notice" role="alert">
          {query.error.message}
        </p>
      )}
      {preview?.kind === "unsupported" && <p className="git-notice">{preview.content}</p>}
      {preview?.kind === "html" && <HtmlPreview file={file} content={preview.content} />}
      {preview?.kind === "image" && (
        <div className="file-image scrollable">
          <img src={preview.content} alt={file.path} />
        </div>
      )}
      {preview?.kind === "text" && (
        <pre
          className="file-source scrollable"
          tabIndex={0}
          aria-label={file.line ? `Source at line ${file.line}` : "Source"}
        >
          <span className="file-source-content">
            {file.line && file.line <= lineCount && (
              <span
                ref={lineRef}
                className="file-line-target"
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
        <div className="file-markdown event-text event-markdown scrollable">
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
