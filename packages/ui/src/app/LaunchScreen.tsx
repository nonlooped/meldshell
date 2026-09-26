import { useEffect, useState, type ReactNode } from "react"
import { useQueries } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { HARNESSES, type Provider } from "@meldshell/contracts"
import { providerStatusQuery } from "../data/providers"
import { MeldMark } from "../ui/MeldMark"
import { ProviderIcon } from "../ui/ProviderIcon"
import { Shimmer, Swap, useMotionPreference } from "../ui/motion"
import {
  harnessSettled,
  LAUNCH_MAX_MS,
  LAUNCH_MIN_MS,
  launchHarnesses,
  type LaunchHarness,
} from "./launch"

const ease = [0.2, 0.7, 0.2, 1] as const
const joinLabels = new Intl.ListFormat("en", { type: "conjunction" })

interface Launch {
  /** Latched off once the app is shown, so a harness that restarts later never brings it back. */
  readonly loading: boolean
  readonly harnesses: readonly (LaunchHarness & { readonly settled: boolean })[]
  readonly snapshotSettled: boolean
}

/**
 * Holds the app behind the launch screen until the snapshot has loaded and every enabled harness has
 * reported a status, after a short minimum and before a ceiling for a harness that never answers.
 */
export function useLaunch(snapshotSettled: boolean, providers: readonly Provider[]): Launch {
  const launchable = launchHarnesses(providers)
  const statuses = useQueries({
    queries: launchable.map(({ harness }) => providerStatusQuery(harness)),
  })
  const harnesses = launchable.map((entry, index) => ({
    ...entry,
    settled: harnessSettled(statuses[index]?.data, statuses[index]?.isError ?? false),
  }))
  const [minElapsed, setMinElapsed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const min = window.setTimeout(() => setMinElapsed(true), LAUNCH_MIN_MS)
    const max = window.setTimeout(() => setTimedOut(true), LAUNCH_MAX_MS)
    return () => {
      window.clearTimeout(min)
      window.clearTimeout(max)
    }
  }, [])
  const ready =
    timedOut || (minElapsed && snapshotSettled && harnesses.every(({ settled }) => settled))
  useEffect(() => {
    if (ready) setShown(true)
  }, [ready])
  return { loading: !shown, harnesses, snapshotSettled }
}

function launchMessage({ harnesses, snapshotSettled }: Launch): string {
  if (!snapshotSettled) return "Opening your threads"
  const pending = harnesses.filter(({ settled }) => !settled)
  if (pending.length === 0) return "Ready"
  return `Connecting to ${joinLabels.format(pending.map(({ harness }) => HARNESSES[harness].label))}`
}

/** Fades the app in as the launch screen leaves; it stays inert and unseen while loading. */
export function LaunchReveal({ loading, children }: { loading: boolean; children: ReactNode }) {
  const reduced = useMotionPreference()
  return (
    <motion.div
      className="w-full h-full"
      inert={loading}
      initial={false}
      animate={loading ? { opacity: 0, scale: 0.985 } : { opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.1, ease }}
    >
      {children}
    </motion.div>
  )
}

/** The branded screen shown while MeldShell loads its threads and connects to its harnesses. */
export function LaunchScreen({ launch }: { launch: Launch }): React.JSX.Element {
  const reduced = useMotionPreference()
  const message = launchMessage(launch)
  const enter = (delay: number, from: Record<string, number | string>) => ({
    initial: reduced ? false : { opacity: 0, ...from },
    animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
    transition: { duration: reduced ? 0 : 0.6, delay: reduced ? 0 : delay, ease },
  })
  return (
    <AnimatePresence>
      {launch.loading && (
        <motion.div
          key="launch"
          role="status"
          aria-label="Starting MeldShell"
          className="absolute inset-0 z-[50] grid place-items-center [-webkit-app-region:drag] select-none text-[var(--text-primary)]"
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.42, ease } }}
        >
          <motion.div
            className="grid justify-items-center -translate-y-[14px]"
            exit={
              reduced
                ? undefined
                : { scale: 1.04, filter: "blur(6px)", transition: { duration: 0.42, ease } }
            }
          >
            <div className="relative grid place-items-center w-[96px] h-[96px]">
              <motion.div
                aria-hidden="true"
                className="absolute inset-[-24px]"
                initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduced ? 0 : 1.1, ease }}
              >
                <motion.div
                  className="w-full h-full rounded-full blur-[30px] [background:conic-gradient(from_0deg,var(--spin-top),var(--spin-middle),var(--spin-bottom),var(--spin-top))]"
                  initial={false}
                  animate={
                    reduced ? { opacity: 0.22 } : { rotate: 360, opacity: [0.16, 0.3, 0.16] }
                  }
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          rotate: { duration: 12, ease: "linear", repeat: Infinity },
                          opacity: { duration: 3.2, ease: "easeInOut", repeat: Infinity },
                        }
                  }
                />
              </motion.div>
              <motion.div {...enter(0, { scale: 0.9, filter: "blur(8px)" })}>
                <MeldMark className="relative block w-[56px] h-[56px]" />
              </motion.div>
            </div>
            <motion.h1
              className="[margin:22px_0_0] [font-family:var(--font-display)] text-[19px] font-semibold tracking-[-0.015em]"
              {...enter(0.14, { y: 6 })}
            >
              MeldShell
            </motion.h1>
            <motion.div
              className="grid justify-items-center gap-[12px] mt-[28px] min-h-[46px]"
              {...enter(0.3, { y: 4 })}
            >
              {launch.harnesses.length > 0 && (
                <div className="flex items-center gap-[14px] text-[var(--text-secondary)]">
                  {launch.harnesses.map(({ harness, provider, settled }) => (
                    <motion.span
                      key={harness}
                      className="grid place-items-center"
                      title={HARNESSES[harness].label}
                      initial={false}
                      animate={
                        settled
                          ? { opacity: 1, filter: "grayscale(0)" }
                          : { opacity: 0.32, filter: "grayscale(1)" }
                      }
                      transition={{ duration: reduced ? 0 : 0.4, ease }}
                    >
                      <ProviderIcon provider={provider} size={15} />
                    </motion.span>
                  ))}
                </div>
              )}
              <div className="w-[320px] text-[12px] text-[var(--text-tertiary)]">
                <Swap id={message}>
                  <Shimmer>{message}</Shimmer>
                </Swap>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
