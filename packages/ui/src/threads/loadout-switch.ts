import { useState } from "react"
import type { AppSnapshot } from "@meldshell/contracts"
import { useThreadSettingsMutation } from "../data/mutations"
import { loadoutSelection, loadoutSettings } from "./loadout-model"

/** Applies saved loadouts by shortcut, with the reason when one cannot be applied. */
export function useLoadoutSwitch(snapshot: AppSnapshot) {
  const mutation = useThreadSettingsMutation()
  const [problem, setProblem] = useState<string | null>(null)
  const loadouts = snapshot.settings.loadouts ?? []
  const apply = (threadId: string, slot: number): void => {
    const loadout = loadouts[slot]
    if (loadout === undefined) return
    if (loadoutSelection(snapshot, loadout) === null)
      setProblem(
        `“${loadout.name}” uses a model that is turned off or removed. Turn it back on in Settings to use this loadout.`,
      )
    else mutation.mutate(loadoutSettings(loadout, threadId))
  }
  return {
    apply,
    count: loadouts.length,
    /** For the app's error toast: a failed switch, or a loadout that cannot be applied. */
    errors: [
      mutation,
      { error: problem === null ? null : new Error(problem), reset: () => setProblem(null) },
    ],
  }
}
