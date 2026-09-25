import { lazy, Suspense, type ComponentProps } from "react"
import { ErrorBoundary } from "react-error-boundary"

const ChangeDiffContent = lazy(() =>
  import("./ChangeDiffContent").then((module) => ({ default: module.ChangeDiff })),
)

/** The raw patch, shown while the diff renderer loads or when it cannot draw a patch. */
export function PlainPatch({ path, patch }: { path: string; patch: string }): React.JSX.Element {
  return (
    <pre className="work-item-output max-h-[220px] m-0 overflow-auto text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[10.75px] leading-[1.55] whitespace-pre-wrap">
      {path}
      {"\n\n"}
      {patch || "No diff was provided for this file."}
    </pre>
  )
}

export function ChangeDiff(props: ComponentProps<typeof ChangeDiffContent>) {
  const fallback = <PlainPatch path={props.path} patch={props.patch} />
  return (
    <ErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <ChangeDiffContent {...props} />
      </Suspense>
    </ErrorBoundary>
  )
}
