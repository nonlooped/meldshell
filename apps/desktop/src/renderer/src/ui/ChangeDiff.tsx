import { lazy, Suspense, type ComponentProps } from "react"
import { ErrorBoundary } from "react-error-boundary"

const ChangeDiffContent = lazy(() =>
  import("./ChangeDiffContent").then((module) => ({ default: module.ChangeDiff })),
)

export function ChangeDiff(props: ComponentProps<typeof ChangeDiffContent>) {
  const fallback = (
    <pre className="work-item-output">
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
