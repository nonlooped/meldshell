import type { Thread } from "@meldshell/contracts"

/** What a thread is doing at a glance, as the collapsed inbox marks it; quiet threads are "idle". */
export type ThreadGlance = "running" | "approval" | "queued" | "failed" | "done" | "idle"

const finishedActivities = new Set<Thread["activity"]>(["completed", "idle", "interrupted"])

export const isFinished = (activity: Thread["activity"]): boolean =>
  finishedActivities.has(activity)

/** A thread that finished while out of view is "done" until it is opened. */
export function threadGlance(activity: Thread["activity"], unseen: boolean): ThreadGlance {
  switch (activity) {
    case "running":
    case "approval":
    case "queued":
    case "failed":
      return activity
    default:
      return unseen ? "done" : "idle"
  }
}

const glanceLabels: Record<ThreadGlance, string | null> = {
  running: "Running",
  approval: "Needs approval",
  queued: "Queued",
  failed: "Failed",
  done: "Done",
  idle: null,
}

export const glanceLabel = (glance: ThreadGlance): string | null => glanceLabels[glance]
