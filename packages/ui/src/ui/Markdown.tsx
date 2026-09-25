import { lazy, Suspense, useContext, useId, useMemo, useRef, useState } from "react"
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown"
import type { Element } from "hast"
import remarkGfm from "remark-gfm"
import { ErrorBoundary } from "react-error-boundary"
import { mayContainMath } from "./markdown-math"
import { cx, markdownInlineClasses, markdownProseClasses } from "./styles"
import { useQuery } from "@tanstack/react-query"
import { MarkdownLink, MarkdownWorkspace, ReferenceChip } from "./MarkdownReference"
import {
  CodeBlock,
  FoldedQuote,
  ImageLightbox,
  MarkdownStreaming,
  MarkdownTable,
} from "./MarkdownBlocks"
import {
  enrichMarkdown,
  fileReference,
  inlineFileReference,
  nodeText,
  prepareMarkdown,
} from "./markdown-model"

function MarkdownImage({ src, alt, node }: { src?: string; alt?: string; node?: Element }) {
  const [failed, setFailed] = useState<string>()
  const scope = useContext(MarkdownWorkspace)
  const reference = fileReference(src ?? "")
  const query = useQuery({
    queryKey: ["workspace-file", scope?.workspaceId, scope?.threadId ?? null, reference?.path],
    queryFn: () => window.meldshell.readWorkspaceFile({ ...scope!, path: reference!.path }),
    enabled: !!scope && !!reference,
    retry: false,
    staleTime: 30_000,
  })
  const source = reference ? (query.data?.kind === "image" ? query.data.content : undefined) : src
  if (!source) return <span>{query.isError ? "Image unavailable" : alt || "Image"}</span>
  if (source === failed) return <span>{alt || "Image"}: image could not be loaded.</span>
  const image = (
    <img src={source} alt={alt ?? ""} loading="lazy" onError={() => setFailed(source)} />
  )
  if (node?.properties.dataLinked) return image
  return (
    <button
      type="button"
      className="markdown-image-button inline-block p-0 border-0 bg-transparent cursor-zoom-in max-w-full [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]"
      aria-label={`Enlarge ${alt || "image"}`}
    >
      {image}
    </button>
  )
}

function codeProperties(node?: Element) {
  const code = node?.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  )
  const classes = code?.properties.className
  const language = Array.isArray(classes)
    ? String(classes.find((value) => String(value).startsWith("language-")) ?? "").slice(9)
    : ""
  const meta = (code?.data as { meta?: string } | undefined)?.meta ?? ""
  const path = /(?:title|filename|file)=["']([^"']+)["']|(?:title|filename|file)=([^\s]+)/.exec(
    meta,
  )
  const start = /(?:start|startLine)=(\d+)/.exec(meta)
  return {
    text: code ? nodeText(code) : "",
    language,
    path: path?.[1] ?? path?.[2] ?? "",
    startLine: start ? Number(start[1]) : 1,
  }
}

// Stable component identities keep block expansion intact as text streams in.
const components: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  pre: ({ node, children }) => <CodeBlock {...codeProperties(node)}>{children}</CodeBlock>,
  code: ({ children, className, node }) => {
    const value = node ? nodeText(node) : typeof children === "string" ? children : ""
    const reference =
      !className && !node?.properties.dataBlock && !value.includes("\n")
        ? inlineFileReference(value)
        : null
    return reference ? (
      <ReferenceChip reference={reference} />
    ) : (
      <code className={className}>{children}</code>
    )
  },
  table: MarkdownTable,
  blockquote: ({ node, children }) => (
    <FoldedQuote length={node ? nodeText(node).length : 0}>{children}</FoldedQuote>
  ),
}
const remarkPlugins = [remarkGfm]
const MarkdownMath = lazy(() => import("./MarkdownMath"))

export function Markdown({
  text,
  className = "",
  streaming = false,
}: {
  readonly text: string
  readonly className?: string
  readonly streaming?: boolean
}): React.JSX.Element {
  const inheritedStreaming = useContext(MarkdownStreaming)
  const content = useRef<HTMLDivElement>(null)
  const prefix = useId().replaceAll(":", "")
  const [gallery, setGallery] = useState<{
    images: { src: string; alt: string }[]
    index: number
  }>()
  const prepared = useMemo(() => prepareMarkdown(text), [text])
  const markdownProps: Options = {
    components,
    remarkPlugins,
    rehypePlugins: [[enrichMarkdown, { prefix, query: "" }]],
    urlTransform: (url, key) =>
      fileReference(url)
        ? url
        : key === "src" && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(url)
          ? url
          : defaultUrlTransform(url),
    children: prepared,
  }
  const fallback = <ReactMarkdown {...markdownProps} />
  return (
    <MarkdownStreaming value={streaming || inheritedStreaming}>
      <div className={`${eventMarkdownClasses} ${className}`}>
        <div
          ref={content}
          className={"[&_>_:first-child]:mt-[0] [&_>_:last-child]:mb-[0]"}
          onClick={(event) => {
            const target = event.target as HTMLElement
            const image = target.closest(".markdown-image-button")?.querySelector("img")
            if (!image) return
            const images = Array.from(
              content.current?.querySelectorAll<HTMLImageElement>(".markdown-image-button img") ??
                [],
            )
            setGallery({
              images: images.map((item) => ({ src: item.src, alt: item.alt })),
              index: images.indexOf(image),
            })
          }}
        >
          {mayContainMath(prepared) ? (
            <ErrorBoundary fallback={fallback}>
              <Suspense fallback={fallback}>
                <MarkdownMath {...markdownProps} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            fallback
          )}
        </div>
        {gallery && (
          <ImageLightbox
            images={gallery.images}
            index={gallery.index}
            onClose={() => setGallery(undefined)}
            onIndex={(index) => setGallery({ ...gallery, index })}
          />
        )}
      </div>
    </MarkdownStreaming>
  )
}

const eventMarkdownClasses = cx(
  "[overflow-wrap:anywhere] text-[var(--text-secondary)] text-[length:var(--transcript-font-size,14px)] leading-[1.65]",
  markdownInlineClasses,
  markdownProseClasses,
)
