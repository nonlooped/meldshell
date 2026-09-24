import { FadeMain } from "./ui/motion"
import { createRoot } from "react-dom/client"
import { Tooltip } from "@base-ui-components/react/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ErrorBoundary } from "react-error-boundary"
import { LucideProvider } from "lucide-react"
import { App } from "./app/App"
import { installDesktopBehavior } from "./app/desktop-behavior"
import { ThreadDragProvider } from "./app/thread-drag"
import { MeldMark } from "./ui/MeldMark"
import { Button } from "./ui/controls"
import "./app/styles.css"

document.documentElement.dataset.platform = window.meldshell.platform
installDesktopBehavior()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
})

const root = document.getElementById("root")

if (root === null) {
  throw new Error("MeldShell could not find its renderer root.")
}

// Icons share one thin optical weight; a component passes strokeWidth only to depart from it.
createRoot(root).render(
  <LucideProvider strokeWidth={1.75}>
    <Tooltip.Provider delay={420} closeDelay={80}>
      <ErrorBoundary
        fallbackRender={({ resetErrorBoundary }) => (
          <FadeMain className={centeredStateClasses}>
            <MeldMark className="brand-mark w-[17px] h-[17px] flex-[0_0_17px] text-[var(--text-primary)]" />
            <h2>The MeldShell interface stopped</h2>
            <p>Your stored threads and background processes are still separate from this view.</p>
            <Button variant="primary" onClick={resetErrorBoundary}>
              Reload interface
            </Button>
          </FadeMain>
        )}
        onReset={() => window.location.reload()}
      >
        <QueryClientProvider client={queryClient}>
          <ThreadDragProvider>
            <App />
          </ThreadDragProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </Tooltip.Provider>
  </LucideProvider>,
)

const centeredStateClasses = [
  "flex h-full flex-col items-center justify-center p-[40px] [grid-row:1_/_-1] text-center",
  "[&_.brand-mark]:w-[34px] [&_.brand-mark]:h-[34px] [&_.brand-mark]:flex-[0_0_34px]",
  "[&_.brand-mark]:mb-[16px] [&_.brand-mark]:text-[var(--text-tertiary)] [&_h2]:m-0",
  "[&_h2]:[font-family:var(--font-display)] [&_h2]:text-[20px] [&_h2]:font-semibold",
  "[&_h2]:tracking-[-0.01em] [&_p]:max-w-[380px] [&_p]:[margin:8px_0_20px]",
  "[&_p]:text-[var(--text-secondary)] [&_p]:text-[12.5px] [&_p]:leading-[1.6] h-full bg-[var(--scrim)]",
].join(" ")
