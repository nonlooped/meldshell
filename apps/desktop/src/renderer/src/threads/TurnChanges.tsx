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
    <section className="turn-changes" aria-label="Turn changes">
      {patches.map(({ path, patch }, index) => (
        <pre className="work-item-output" key={`${index}:${path}`}>
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
