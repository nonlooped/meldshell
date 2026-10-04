import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { Button } from "../ui/controls"
import { disclosureChevronClasses } from "../ui/styles"
import { jsonCount } from "./preview-model"

/** Children shown at once; larger arrays and objects reveal the rest on request. */
const CHUNK = 100
/** Levels open when the tree first shows. */
const INITIAL_DEPTH = 2

interface NodeProps {
  readonly name: string | null
  readonly value: unknown
  readonly depth: number
  /** Nodes shallower than this start open. */
  readonly openDepth: number
  readonly last: boolean
}

function Primitive({ value }: { value: unknown }) {
  if (typeof value === "string")
    return <span className="text-[var(--color-added)]">{JSON.stringify(value)}</span>
  if (typeof value === "number")
    return <span className="text-[var(--color-modified)]">{String(value)}</span>
  if (typeof value === "boolean")
    return <span className="text-[var(--color-renamed)]">{String(value)}</span>
  return <span className="text-[var(--text-tertiary)]">null</span>
}

function Key({ name }: { name: string | null }) {
  if (name === null) return null
  return (
    <>
      <span className="text-[var(--color-info)]">{name}</span>
      <span className="text-[var(--text-tertiary)]">:{"\u00a0"}</span>
    </>
  )
}

function JsonNode({ name, value, depth, openDepth, last }: NodeProps) {
  const container = value !== null && typeof value === "object"
  const [open, setOpen] = useState(depth < openDepth)
  const [shown, setShown] = useState(CHUNK)
  const comma = last ? null : <span className="text-[var(--text-tertiary)]">,</span>
  if (!container)
    return (
      <div className={rowClasses} role="treeitem" aria-level={depth + 1} aria-selected={false}>
        <Key name={name} />
        <Primitive value={value} />
        {comma}
      </div>
    )

  const array = Array.isArray(value)
  const entries: [string | null, unknown][] = array
    ? value.map((entry) => [null, entry])
    : Object.entries(value)
  const [opening, closing] = array ? ["[", "]"] : ["{", "}"]
  const empty = entries.length === 0
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={empty ? undefined : open}
      aria-selected={false}
    >
      <button
        type="button"
        className={`motion-colors ${toggleClasses}`}
        disabled={empty}
        data-panel-open={(open && !empty) || undefined}
        onClick={() => setOpen(!open)}
      >
        {!empty && <ChevronRight className={disclosureChevronClasses} size={12} />}
        <Key name={name} />
        <span className="text-[var(--text-tertiary)]">{opening}</span>
        {(!open || empty) && (
          <>
            {!empty && <span className={countClasses}>{jsonCount(value)}</span>}
            <span className="text-[var(--text-tertiary)]">{closing}</span>
            {comma}
          </>
        )}
      </button>
      {open && !empty && (
        <>
          <div role="group" className={groupClasses}>
            {entries.slice(0, shown).map(([key, entry], index) => (
              <JsonNode
                key={key ?? index}
                name={array ? null : JSON.stringify(key)}
                value={entry}
                depth={depth + 1}
                openDepth={openDepth}
                last={index === entries.length - 1}
              />
            ))}
            {shown < entries.length && (
              <Button
                size="sm"
                variant="ghost"
                className="w-fit my-[2px]"
                onClick={() => setShown(shown + CHUNK)}
              >
                Show {Math.min(CHUNK, entries.length - shown).toLocaleString()} more of{" "}
                {(entries.length - shown).toLocaleString()}
              </Button>
            )}
          </div>
          <div className={`${rowClasses} pl-[18px]`}>
            <span className="text-[var(--text-tertiary)]">{closing}</span>
            {comma}
          </div>
        </>
      )}
    </div>
  )
}

/** A parsed JSON document as a tree whose objects and arrays fold open and closed. */
export function JsonTree({ value }: { value: unknown }) {
  // Remounting the tree with a new depth applies Expand all or Collapse all to every node.
  const [view, setView] = useState({ openDepth: INITIAL_DEPTH, generation: 0 })
  const expand = (openDepth: number) =>
    setView((current) => ({ openDepth, generation: current.generation + 1 }))
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-[4px] [padding:6px_12px] border-b-[1px] border-b-[color:var(--line-subtle)]">
        <Button size="sm" variant="ghost" onClick={() => expand(64)}>
          Expand all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => expand(1)}>
          Collapse all
        </Button>
      </div>
      <div
        role="tree"
        aria-label="JSON tree"
        className="flex-1 min-h-0 overflow-auto [padding:12px_16px_24px] [font:13px_/_1.6_var(--font-mono)] text-[var(--text-secondary)] [scrollbar-gutter:stable]"
      >
        <JsonNode
          key={view.generation}
          name={null}
          value={value}
          depth={0}
          openDepth={view.openDepth}
          last
        />
      </div>
    </div>
  )
}

const rowClasses = "pl-[18px] whitespace-pre-wrap [overflow-wrap:anywhere]"

const toggleClasses = [
  "flex items-center gap-0 w-full min-h-[20px] p-0 border-0 rounded-[var(--radius-sm)] bg-transparent",
  "text-left text-inherit [font:inherit] cursor-default [&:hover]:bg-[var(--surface-hover)]",
  "disabled:cursor-default disabled:pl-[18px] disabled:[&:hover]:bg-transparent",
  "[&:focus-visible]:[outline:1px_solid_var(--focus-ring)] [&_>_svg]:flex-none [&_>_svg]:w-[18px]",
].join(" ")

const countClasses = [
  "mx-[6px] [padding:0_6px] rounded-[999px] bg-[var(--surface-hover)] text-[var(--text-tertiary)]",
  "[font-family:var(--font-text)] text-[11px]",
].join(" ")

const groupClasses = "ml-[8px] pl-[2px] border-l-[1px] border-l-[color:var(--line-subtle)]"
