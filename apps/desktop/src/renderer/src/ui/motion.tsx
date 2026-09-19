import { installStyleMotion } from "./style-motion"
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react"
import { MotionConfig, motion, type HTMLMotionProps } from "motion/react"
import { LoaderCircle } from "lucide-react"

const ReducedMotion = createContext(false)
const ease = [0.2, 0.7, 0.2, 1] as const

function systemReducesMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
function subscribeReducedMotion(notify: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)")
  media.addEventListener("change", notify)
  return () => media.removeEventListener("change", notify)
}

/** App and operating-system preferences disable every animation, including opacity and spinners. */
export function MotionPreferences({
  reduceMotion,
  children,
}: {
  reduceMotion: boolean
  children: ReactNode
}) {
  const systemReduced = useSyncExternalStore(
    subscribeReducedMotion,
    systemReducesMotion,
    () => false,
  )
  const reduced = reduceMotion || Boolean(systemReduced)
  useEffect(() => (reduced ? undefined : installStyleMotion(document.documentElement)), [reduced])
  return (
    <ReducedMotion.Provider value={reduced}>
      <MotionConfig
        reducedMotion={reduced ? "always" : "never"}
        transition={{ duration: reduced ? 0 : 0.12, ease }}
      >
        {children}
      </MotionConfig>
    </ReducedMotion.Provider>
  )
}

export function useMotionPreference() {
  return useContext(ReducedMotion)
}

function useEnterMotion(duration = 0.28) {
  const reduced = useMotionPreference()
  return {
    initial: reduced ? (false as const) : { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: reduced ? 0 : duration, ease },
  }
}

export function Pressable(props: HTMLMotionProps<"button">) {
  const reduced = useMotionPreference()
  return (
    <motion.button whileTap={reduced || props.disabled ? undefined : { scale: 0.96 }} {...props} />
  )
}

/** Base UI passes its open/closed attributes through render without changing focus or dismissal. */
export function MotionSurface({
  kind = "popup",
  ...props
}: HTMLMotionProps<"div"> & {
  kind?: "popup" | "dialog" | "backdrop" | "tooltip" | "toast"
  "data-closed"?: string
  "data-ending-style"?: string
  "data-side"?: string
}) {
  const reduced = useMotionPreference()
  const closed = props["data-closed"] !== undefined || props["data-ending-style"] !== undefined
  const { hidden, visible, duration } = surfaceMotion(kind, props["data-side"])
  return (
    <motion.div
      {...props}
      initial={reduced ? false : hidden}
      animate={closed ? hidden : visible}
      exit={hidden}
      transition={{
        duration: reduced ? 0 : closed ? 0.12 : duration,
        ease,
      }}
    />
  )
}

function surfaceMotion(kind: string, side?: string) {
  if (kind === "dialog")
    return {
      hidden: { opacity: 0, transform: "translate(-50%, -48%) scale(0.98)" },
      visible: { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      duration: 0.28,
    }
  if (kind === "popup")
    return {
      hidden: { opacity: 0, transform: `translateY(${side === "top" ? 4 : -4}px) scale(0.96)` },
      visible: { opacity: 1, transform: "translateY(0px) scale(1)" },
      duration: 0.2,
    }
  if (kind === "tooltip")
    return {
      hidden: { opacity: 0, transform: "scale(0.96)" },
      visible: { opacity: 1, transform: "scale(1)" },
      duration: 0.11,
    }
  return { hidden: { opacity: 0 }, visible: { opacity: 1 }, duration: 0.2 }
}

const SpinningLoader = motion.create(LoaderCircle)
export function ActivitySpinner() {
  const reduced = useMotionPreference()
  return (
    <SpinningLoader
      size={12}
      aria-hidden="true"
      animate={{ rotate: reduced ? 0 : 360 }}
      transition={reduced ? { duration: 0 } : { duration: 1.8, ease: "linear", repeat: Infinity }}
    />
  )
}

export function FadeDiv({
  duration = 0.28,
  ...props
}: HTMLMotionProps<"div"> & { duration?: number }) {
  return <motion.div {...useEnterMotion(duration)} {...props} />
}
export function FadeMain(props: HTMLMotionProps<"main">) {
  return <motion.main {...useEnterMotion()} {...props} />
}
