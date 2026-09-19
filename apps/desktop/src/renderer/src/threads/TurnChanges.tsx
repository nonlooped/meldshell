import { lazy, Suspense } from "react"
import type { CanonicalEvent } from "@meldshell/contracts"
import { ErrorBoundary } from "react-error-boundary"
import { turnChangePatches } from "./file-change-diffs"

const TurnChangesContent = lazy(() =>
  import("./TurnChangesContent").then((module) => ({ default: module.TurnChanges })),
)

export function TurnChanges({ events }: { events: ReadonlyArray<CanonicalEvent> }) {
  const patches = turnChangePatches(events)
  if (patches.length === 0) return null
  const fallback = (
    <section
      className="turn-changes border-t-[1px] border-t-[color:var(--line-subtle)] pt-[10px] min-w-0"
      aria-label="Turn changes"
    >
      {patches.map(({ path, patch }, index) => (
        <pre
          className="work-item-output max-h-[220px] m-0 overflow-auto text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[10.75px] leading-[1.55] whitespace-pre-wrap"
          key={`${index}:${path}`}
        >
          {path}
          {"\n\n"}
          {patch}
        </pre>
      ))}
    </section>
  )
  return (
    <ErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <TurnChangesContent events={events} />
      </Suspense>
    </ErrorBoundary>
  )
}
