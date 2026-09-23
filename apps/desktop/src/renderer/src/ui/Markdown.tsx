import { lazy, Suspense, useContext, useId, useMemo, useRef, useState } from "react"
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown"
import type { Element } from "hast"
import remarkGfm from "remark-gfm"
import { ErrorBoundary } from "react-error-boundary"
import { mayContainMath } from "./markdown-math"
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
  const workspace = useContext(MarkdownWorkspace)
  const reference = fileReference(src ?? "")
  const query = useQuery({
    queryKey: ["workspace-file", workspace?.id, reference?.path],
    queryFn: () =>
      window.meldshell.readWorkspaceFile({ workspaceId: workspace!.id, path: reference!.path }),
    enabled: !!workspace && !!reference,
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

const eventMarkdownClasses = [
  "[overflow-wrap:anywhere] text-[var(--text-secondary)] text-[length:var(--transcript-font-size,14px)]",
  "leading-[1.65] event-markdown whitespace-normal [&_>_:first-child]:mt-[0] [&_>_:last-child]:mb-[0]",
  "[&_p]:[margin:0_0_0.7em] [&_a]:text-[var(--color-info)]",
  "[&_a]:[text-decoration-color:color-mix(in_srgb,_var(--color-info)_50%,_transparent)]",
  "[&_a]:[text-underline-offset:3px] [&_code:not(pre_code)]:[padding:1px_5px]",
  "[&_code:not(pre_code)]:rounded-[var(--radius-sm)] [&_code:not(pre_code)]:text-[var(--text-primary)]",
  "[&_code:not(pre_code)]:[background:color-mix(in_srgb,_var(--text-primary)_7%,_transparent)]",
  "[&_code:not(pre_code)]:[box-decoration-break:clone] [&_code:not(pre_code)]:[-webkit-box-decoration-break:clone]",
  "[&_code:not(pre_code)]:[font-family:var(--font-mono)] [&_code:not(pre_code)]:text-[0.86em]",
  "[&_strong]:font-semibold [&_strong]:text-[var(--text-primary)]",
  "[&_.markdown-table]:max-w-full [&_.markdown-table]:overflow-x-auto [&_.markdown-table]:[margin:1em_0]",
  "[&_.markdown-table]:border-[1px] [&_.markdown-table]:border-[color:var(--line)] [&_.markdown-table]:rounded-[var(--radius)]",
  "[&_.markdown-table]:max-h-[400px] [&_.markdown-table]:overflow-auto [&_.markdown-table]:mt-[0]",
  "[&_.markdown-table:focus-visible]:[outline:1px_solid_var(--focus-ring)]",
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
