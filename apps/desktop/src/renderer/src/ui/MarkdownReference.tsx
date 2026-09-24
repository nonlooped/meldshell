import { createContext, useContext, useState, type ReactNode } from "react"
import type { Element } from "hast"
import { useQuery } from "@tanstack/react-query"
import { ContentTooltip } from "./controls"
import { BookOpen, Globe } from "lucide-react"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { useTabStore } from "../app/tab-store"
import { scopeKey } from "../data/workspace-scope"
import { FileIcon } from "./FileIcon"
import { SourceCode } from "./SourceCode"
import {
  fileReference,
  highlightText,
  nodeText,
  webLinkLabel,
  type FileReference,
} from "./markdown-model"
import { MarkdownSearch } from "./MarkdownBlocks"

/** The folder that file references in rendered Markdown resolve against. */
export const MarkdownWorkspace = createContext<WorkspaceScope | undefined>(undefined)
export const MarkdownSources = createContext<ReadonlyMap<string, string>>(new Map())

function SearchText({ text }: { text: string }) {
  const query = useContext(MarkdownSearch)
  return (
    <>
      {highlightText(text, query).map((node, index) =>
        node.type === "text" ? (
          node.value
        ) : (
          <mark key={index} data-match>
            {nodeText(node)}
          </mark>
        ),
      )}
    </>
  )
}

function ReferenceExcerpt({
  reference,
  scope,
}: {
  reference: FileReference
  scope: WorkspaceScope
}) {
  const query = useQuery({
    queryKey: ["workspace-file", ...scopeKey(scope), reference.path],
    queryFn: () => window.meldshell.readWorkspaceFile({ ...scope, path: reference.path }),
    staleTime: 30_000,
    retry: false,
  })
  if (query.isPending) return <span>Loading preview…</span>
  if (query.isError) return <span>Preview unavailable. {query.error.message}</span>
  if (!["text", "markdown", "html"].includes(query.data.kind))
    return <span>Open file to view.</span>
  const lines = query.data.content.split("\n")
  if (reference.line && reference.line > lines.length)
    return <span>The referenced line is no longer in this file.</span>
  const start = Math.max(0, (reference.line ?? 1) - 3)
  const excerpt = lines.slice(start, start + 10).join("\n")
  return (
    <>
      <span>
        Current file · lines {start + 1}–{start + excerpt.split("\n").length}
      </span>
      <pre>
        <SourceCode text={excerpt} path={reference.path} />
      </pre>
    </>
  )
}

export function ReferenceChip({ reference, label }: { reference: FileReference; label?: string }) {
  const scope = useContext(MarkdownWorkspace)
  const openFile = useTabStore((state) => state.openFile)
  const [open, setOpen] = useState(false)
  const name = reference.path.split("/").at(-1) ?? reference.path
  const title = `${reference.path}${reference.line ? `:${reference.line}` : ""}`
  const content = (
    <>
      {reference.skill ? <BookOpen size={13} /> : <FileIcon path={reference.path} size={13} />}
      <span>
        <SearchText
          text={reference.skill ? label || reference.path.split("/").at(-2) || "Skill" : name}
        />
      </span>
      {reference.line && (
        <span className="text-[var(--text-secondary)]">
          · L{reference.line}
          {reference.endLine ? `–${reference.endLine}` : ""}
        </span>
      )}
    </>
  )
  if (!scope)
    return (
      <span className={referenceChipClasses} title={title}>
        {content}
      </span>
    )
  return (
    <ContentTooltip
      open={open}
      onOpenChange={setOpen}
      className={referencePreviewClasses}
      trigger={
        <button
          type="button"
          className={referenceChipClasses}
          aria-label={`Open ${title}`}
          onClick={() => openFile(scope, reference.path, reference.line, reference.endLine)}
        >
          {content}
        </button>
      }
    >
      <span>{title}</span>
      {open && <ReferenceExcerpt reference={reference} scope={scope} />}
    </ContentTooltip>
  )
}

export function MarkdownLink({
  href,
  title,
  children,
  node,
}: {
  href?: string
  title?: string
  children?: ReactNode
  node?: Element
}) {
  const reference = fileReference(href ?? "")
  if (reference)
    return (
      <ReferenceChip
        reference={reference}
        label={typeof children === "string" ? children : undefined}
      />
    )
  if (!href) return <span>{children}</span>
  if (href.startsWith("#"))
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault()
          const root = event.currentTarget.closest(".event-markdown")
          const target = Array.from(root?.querySelectorAll("h1,h2,h3,h4,h5,h6") ?? []).find(
            (element) =>
              element.id === href.slice(1) ||
              element.textContent
                ?.toLowerCase()
                .replace(/[^\w]+/g, "-")
                .replace(/^-|-$/g, "") === href.slice(1),
          )
          target?.scrollIntoView({ block: "center" })
        }}
      >
        {children}
      </a>
    )
  if (!/^https?:\/\//i.test(href)) return <span>{children}</span>
  if (node?.children.some((child) => child.type === "element" && child.tagName === "img"))
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  return (
    <WebPageLink
      href={href}
      fallback={node ? nodeText(node) : typeof children === "string" ? children : ""}
      suppliedTitle={title}
    />
  )
}

function WebPageLink({
  href,
  fallback,
  suppliedTitle,
}: {
  href: string
  fallback: string
  suppliedTitle?: string
}) {
  const sources = useContext(MarkdownSources)
  const query = useQuery({
    queryKey: ["web-page-title", href],
    queryFn: () => window.meldshell.getWebPageTitle(href),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
  const title = webLinkLabel(query.data, sources.get(href) || suppliedTitle, fallback)
  return (
    <a
      className={"[&_>_svg]:[vertical-align:-1px] [&_>_svg]:mr-[4px]"}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <Globe size={12} aria-hidden="true" />
      <SearchText text={title} />
    </a>
  )
}

// File references read as links rather than inline code: no chip, an underline that firms up on hover.
const referenceChipClasses = [
  "inline-flex items-center gap-[4px] max-w-full [vertical-align:baseline] [padding:0_1px]",
  "border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-primary)]",
  "[font:0.86em_var(--font-mono)] cursor-pointer [&_>_span]:overflow-hidden",
  "[&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap [&_svg]:shrink-0",
  "[&:is(button)_>_span:first-of-type]:underline [&_>_span]:[text-underline-offset:3px]",
  "[&_>_span]:[text-decoration-color:var(--line-strong)]",
  "[&:is(button):hover_>_span]:[text-decoration-color:currentColor] [&:is(button):hover]:text-[var(--color-info)]",
  "[&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]",
].join(" ")

const referencePreviewClasses = [
  "[&_.token.comment]:text-[var(--text-tertiary)] [&_.token.prolog]:text-[var(--text-tertiary)]",
  "[&_.token.doctype]:text-[var(--text-tertiary)] [&_.token.keyword]:text-[var(--color-renamed)]",
  "[&_.token.tag]:text-[var(--color-renamed)] [&_.token.boolean]:text-[var(--color-renamed)]",
  "[&_.token.string]:text-[var(--color-added)] [&_.token.attr-value]:text-[var(--color-added)]",
  "[&_.token.number]:text-[var(--color-modified)] [&_.token.function]:text-[var(--color-modified)]",
  "[&_.token.class-name]:text-[var(--color-modified)] [&_.token.property]:text-[var(--color-info)]",
  "[&_.token.attr-name]:text-[var(--color-info)] max-w-[min(620px,_85vw)] whitespace-normal",
  "[overflow-wrap:anywhere] [&_>_span]:block [&_>_span]:mb-[6px] [&_pre]:m-0 [&_pre]:max-h-[240px]",
  "[&_pre]:overflow-auto [&_pre]:[font:12px_var(--font-mono)] [&_pre]:whitespace-pre [&_pre]:text-left",
].join(" ")
