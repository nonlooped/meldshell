import { lazy, Suspense, type ComponentProps } from "react"
import { ErrorBoundary } from "react-error-boundary"

const ChangeDiffContent = lazy(() =>
  import("./ChangeDiffContent").then((module) => ({ default: module.ChangeDiff })),
)

export function ChangeDiff(props: ComponentProps<typeof ChangeDiffContent>) {
  const fallback = (
    <pre className="work-item-output max-h-[220px] m-0 overflow-auto text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[10.75px] leading-[1.55] whitespace-pre-wrap">
      {props.path}
      {"\n\n"}
      {props.patch || "No diff was provided for this file."}
    </pre>
  )
  return (
    <ErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <ChangeDiffContent {...props} />
      </Suspense>
    </ErrorBoundary>
  )
}
