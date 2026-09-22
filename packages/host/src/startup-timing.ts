import { performance } from "node:perf_hooks"

// Monotonic elapsed time from main-process start, shared by all startup milestones.
export const logStartupTiming = (milestone: string, detail?: string): void => {
  console.info(
    `[startup] ${milestone} +${performance.now().toFixed(1)}ms${detail ? ` ${detail}` : ""}`,
  )
}
