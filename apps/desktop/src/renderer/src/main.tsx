import { createRoot } from "react-dom/client"
import { Tooltip } from "@base-ui-components/react/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ErrorBoundary } from "react-error-boundary"
import { App } from "./app/App"
import { MeldMark } from "./ui/MeldMark"
import { Button } from "./ui/controls"
import "./app/styles.css"

document.documentElement.dataset.platform = window.meldshell.platform

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

createRoot(root).render(
  <Tooltip.Provider delay={420} closeDelay={80}>
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <main className="centered-state renderer-failure">
          <MeldMark className="brand-mark" />
          <h2>The MeldShell interface stopped</h2>
          <p>Your stored threads and background processes are still separate from this view.</p>
          <Button variant="primary" onClick={resetErrorBoundary}>
            Reload interface
          </Button>
        </main>
      )}
      onReset={() => window.location.reload()}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </Tooltip.Provider>,
)
