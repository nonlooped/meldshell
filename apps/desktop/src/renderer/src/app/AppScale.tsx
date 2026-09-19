import { animate, type AnimationPlaybackControls } from "motion"
import { MotionSurface } from "../ui/motion"
import { useEffect } from "react"
import { Toast } from "@base-ui-components/react/toast"
import { nextScale, scaleShortcut } from "./app-scale"

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
    let animation: AnimationPlaybackControls | undefined
    const apply = (value: number) => {
      current = value
      root.style.setProperty("--app-scale", String(value / 100))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = scaleShortcut(event)
      if (!direction) return
      event.preventDefault()
      const next = nextScale(target, direction)
      if (next === target) return
      target = next
      add({ title: `Scale ${target}%`, priority: "low" })
      animation?.stop()
      if (reducedMotion.matches || root.dataset.reduceMotion === "true") apply(target)
      else
        animation = animate(current, target, {
          duration: 0.14,
          ease: [0.33, 1, 0.68, 1],
          onUpdate: apply,
        })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      animation?.stop()
      root.style.removeProperty("--app-scale")
    }
  }, [add])

  return (
    <Toast.Portal>
      <Toast.Viewport
        className="fixed top-[calc(var(--titlebar-height)_+_12px)] right-[20px] z-[10000] pointer-events-none"
        aria-label="App scale"
      >
        {toasts.map((toast) => (
          <Toast.Root
            render={<MotionSurface kind="toast" />}
            key={toast.id}
            toast={toast}
            className="[padding:8px_12px] border-[1px] border-[color:var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface-menu)] text-[var(--text-primary)] [box-shadow:var(--shadow-popup)] text-[13px] tabular-nums pointer-events-none [&[data-limited]]:hidden"
            swipeDirection={[]}
          >
            <Toast.Title render={<div />} />
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
