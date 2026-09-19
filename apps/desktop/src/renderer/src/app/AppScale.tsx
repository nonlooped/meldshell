import { useEffect } from "react"
import { Toast } from "@base-ui-components/react/toast"
import { nextScale, scaleShortcut } from "./app-scale"
import "./app-scale.css"

export function AppScale(): React.JSX.Element {
  return (
    <Toast.Provider timeout={1800} limit={1}>
      <ScaleControls />
    </Toast.Provider>
  )
}

function ScaleControls(): React.JSX.Element {
  const { add, toasts } = Toast.useToastManager()

  useEffect(() => {
    const root = document.documentElement
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let current = 100
    let target = 100
    let frame = 0
    const apply = (value: number) => {
      current = value
      root.style.setProperty("--app-scale", String(value / 100))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = scaleShortcut(event)
      if (!direction) return
      event.preventDefault()
      target = nextScale(target, direction)
      add({ title: `Scale ${target}%`, priority: "low" })
      cancelAnimationFrame(frame)
      const from = current
      const start = performance.now()
      const animate = (now: number) => {
        const progress = Math.min(1, (now - start) / 140)
        apply(from + (target - from) * (1 - (1 - progress) ** 3))
        if (progress < 1) frame = requestAnimationFrame(animate)
      }
      if (reducedMotion.matches) apply(target)
      else frame = requestAnimationFrame(animate)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      cancelAnimationFrame(frame)
      root.style.removeProperty("--app-scale")
    }
  }, [add])

  return (
    <Toast.Portal>
      <Toast.Viewport className="app-scale-viewport" aria-label="App scale">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="app-scale-indicator"
            swipeDirection={[]}
          >
            <Toast.Title render={<div />} />
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
