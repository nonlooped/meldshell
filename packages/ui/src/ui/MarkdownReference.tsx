import { cx, syntaxTokenClasses } from "./styles"
import { useContext, useState, type ReactNode } from "react"
import type { Element } from "hast"
import { useQuery } from "@tanstack/react-query"
import { ContentTooltip, ContextMenu, MenuAction } from "./controls"
import { BookOpen, Globe } from "lucide-react"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { useTabStore } from "../app/tab-store"
import { scopeKey } from "../data/workspace-scope"
import { FileIcon } from "./FileIcon"
import { SourceCode } from "./SourceCode"
import { fileReference, nodeText, webLinkLabel, type FileReference } from "./markdown-model"
import { MarkdownWorkspace, MarkdownSources } from "./MarkdownContexts"

export { MarkdownWorkspace, MarkdownSources } from "./MarkdownContexts"

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
      <span>{reference.skill ? label || reference.path.split("/").at(-2) || "Skill" : name}</span>
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
      <ContextMenu
        trigger={
          <span className={referenceChipClasses} title={title}>
            {content}
          </span>
        }
      >
        <MenuAction onClick={() => void navigator.clipboard.writeText(title)}>
          Copy reference
        </MenuAction>
        <MenuAction onClick={() => void navigator.clipboard.writeText(reference.path)}>
          Copy path
        </MenuAction>
      </ContextMenu>
    )
  return (
    <ContextMenu
      trigger={
        <span className="inline-flex">
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
        </span>
      }
    >
      <MenuAction
        onClick={() => openFile(scope, reference.path, reference.line, reference.endLine)}
      >
        Open file
      </MenuAction>
      <MenuAction onClick={() => void navigator.clipboard.writeText(title)}>
        Copy reference
      </MenuAction>
      <MenuAction onClick={() => void navigator.clipboard.writeText(reference.path)}>
        Copy path
      </MenuAction>
    </ContextMenu>
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
      <ContextMenu
        trigger={
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        }
      >
        <MenuAction onClick={() => void window.open(href, "_blank")}>Open link</MenuAction>
        <MenuAction onClick={() => void navigator.clipboard.writeText(href)}>
          Copy link address
        </MenuAction>
      </ContextMenu>
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
    <ContextMenu
      trigger={
        <a
          className={"[&_>_svg]:[vertical-align:-1px] [&_>_svg]:mr-[4px]"}
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          <Globe size={12} aria-hidden="true" />
          {title}
        </a>
      }
    >
      <MenuAction onClick={() => void window.open(href, "_blank")}>Open link</MenuAction>
      <MenuAction onClick={() => void navigator.clipboard.writeText(href)}>
        Copy link address
      </MenuAction>
    </ContextMenu>
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

const referencePreviewClasses = cx(
  syntaxTokenClasses,
  [
    "max-w-[min(620px,_calc(var(--viewport-w)_*_0.85))] whitespace-normal",
    "[overflow-wrap:anywhere] [&_>_span]:block [&_>_span]:mb-[6px] [&_pre]:m-0 [&_pre]:max-h-[240px]",
    "[&_pre]:overflow-auto [&_pre]:[font:12px_var(--font-mono)] [&_pre]:whitespace-pre [&_pre]:text-left",
  ].join(" "),
)
