import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { AnimatePresence, MotionConfig, motion, type HTMLMotionProps } from "motion/react"
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

const spinRows = ["var(--spin-top)", "var(--spin-middle)", "var(--spin-bottom)"]

/** Working indicator: a 3×3 dot matrix whose pulse rises from the bottom-center cell. */
export function GradientSpinner({ size = 12 }: { size?: number }) {
  const reduced = useMotionPreference()
  const cell = size / 4
  return (
    <span
      aria-hidden="true"
      className="inline-grid flex-none grid-cols-3"
      style={{ width: size, height: size, gap: cell / 2 }}
    >
      {spinRows.flatMap((color, row) =>
        [0, 1, 2].map((column) => {
          // Distance from the wave origin becomes a phase lead of up to three quarters.
          const phase = (2 - row + Math.abs(column - 1)) / 4
          return (
            <span
              key={`${row}-${column}`}
              className={`rounded-full ${reduced ? "" : "animate-gspin"}`}
              style={{ background: color, animationDelay: `${-phase * 750}ms` }}
            />
          )
        }),
      )}
    </span>
  )
}

/** A highlight that sweeps across running text; still text when motion is reduced. */
export function Shimmer({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = useMotionPreference()
  if (reduced) return <span className={className}>{children}</span>
  return (
    <span
      className={`animate-shimmer bg-clip-text text-transparent [background-size:300%_100%] [background-image:linear-gradient(90deg,var(--text-tertiary)_38%,var(--text-primary)_50%,var(--text-tertiary)_62%)] ${className}`}
    >
      {children}
    </span>
  )
}

/** Crossfades keyed content in place, e.g. an icon that changes meaning. */
export function Swap({
  id,
  children,
  className = "grid place-items-center",
}: {
  id: string
  children: ReactNode
  className?: string
}) {
  const reduced = useMotionPreference()
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        key={id}
        className={className}
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -6, transition: { duration: reduced ? 0 : 0.16 } }}
        transition={{ duration: 0.16 }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  )
}

/** Crossfades text that changes, such as a renamed title, while keeping its ellipsis. */
export function TextSwap({ text }: { text: string }) {
  return (
    <Swap id={text} className="block overflow-hidden text-ellipsis whitespace-nowrap">
      {text}
    </Swap>
  )
}

/** Springs a control in and out as it appears and disappears. */
export function PopPresence({
  show,
  children,
  className = "inline-flex",
}: {
  show: boolean
  children: ReactNode
  className?: string
}) {
  const reduced = useMotionPreference()
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          className={className}
          initial={reduced ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{
            opacity: 0,
            scale: reduced ? 1 : 0.6,
            transition: { duration: reduced ? 0 : 0.14 },
          }}
          transition={{ type: "spring", stiffness: 520, damping: 30 }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
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

/**
 * A Collapsible panel that grows open and folds shut with a CSS transition, which Base UI waits for
 * before it hides a closing panel; panels that start open do not animate. Layout classes apply to an
 * inner element, so spacing folds away with the height.
 */
export function CollapsiblePanel({
  className,
  children,
  ...props
}: Omit<Collapsible.Panel.Props, "className"> & { readonly className?: string }) {
  return (
    <Collapsible.Panel {...props} className="motion-collapse">
      <div className={className}>{children}</div>
    </Collapsible.Panel>
  )
}
