import {
  MAX_LOADOUTS,
  type AppSnapshot,
  type Loadout,
  type SetThreadSettingsInput,
} from "@meldshell/contracts"
import { effortLabel, selectableModels, type Selection } from "../data/catalog"
import { modelLabel } from "../data/model-label"

/*
 * Loadouts save which agent and model a thread uses, with its reasoning effort and speed, so one
 * shortcut can bring them back. The agent follows from the model. Mode and permissions stay as the
 * thread has them.
 */

const LOADOUT_FIELDS = ["modelId", "reasoningEffort", "speed"] as const

/** The part of a composer selection a loadout saves. */
export type LoadoutChoice = Pick<Selection, "provider" | "model" | "reasoningEffort" | "speed">

export const loadoutFromSelection = (
  selection: LoadoutChoice,
  name: string,
  id: string,
): Loadout => ({
  id,
  name: name.trim().slice(0, 48),
  modelId: selection.model.id,
  reasoningEffort: selection.reasoningEffort,
  speed: selection.speed,
})

/** The loadout the composer is set to, if any. */
export const activeLoadout = (
  loadouts: ReadonlyArray<Loadout>,
  selection: LoadoutChoice,
): Loadout | undefined => {
  const current = loadoutFromSelection(selection, "", "")
  return loadouts.find((loadout) => LOADOUT_FIELDS.every((key) => loadout[key] === current[key]))
}

export const loadoutSettings = (loadout: Loadout, threadId: string): SetThreadSettingsInput => ({
  threadId,
  modelId: loadout.modelId,
  reasoningEffort: loadout.reasoningEffort,
  speed: loadout.speed,
})

/** The composer setup a loadout describes, or null once its model can no longer run turns. */
export const loadoutSelection = (snapshot: AppSnapshot, loadout: Loadout): LoadoutChoice | null => {
  const model = selectableModels(snapshot).find((candidate) => candidate.id === loadout.modelId)
  const provider = snapshot.providers.find((entry) => entry.id === model?.providerId)
  if (model === undefined || provider === undefined) return null
  return {
    provider,
    model,
    reasoningEffort: loadout.reasoningEffort,
    speed: loadout.speed,
  }
}

/** One line naming what a loadout sets, as in `Claude · Opus 4.5 · High effort`. */
export const describeLoadout = ({ model, provider, reasoningEffort, speed }: LoadoutChoice) => {
  const parts = [provider.displayName, modelLabel(model.displayName)]
  if (reasoningEffort !== null && model.reasoningEfforts.includes(reasoningEffort))
    parts.push(`${effortLabel(reasoningEffort)} effort`)
  if (speed === "fast" && model.supportsFast) parts.push("Fast")
  return parts.join(" · ")
}

/** A first name for a new loadout: its model and effort, numbered if that name is taken. */
export const suggestedLoadoutName = (
  loadouts: ReadonlyArray<Loadout>,
  selection: LoadoutChoice,
): string => {
  const effort =
    selection.reasoningEffort === null ? "" : ` ${effortLabel(selection.reasoningEffort)}`
  const base = `${modelLabel(selection.model.displayName)}${effort}`.slice(0, 44)
  const taken = new Set(loadouts.map((loadout) => loadout.name))
  for (let count = 1; ; count += 1) {
    const name = count === 1 ? base : `${base} ${count}`
    if (!taken.has(name)) return name
  }
}

export const canAddLoadout = (loadouts: ReadonlyArray<Loadout>): boolean =>
  loadouts.length < MAX_LOADOUTS

/** Moves a loadout one place, which also moves it to the neighbouring shortcut. */
export const moveLoadout = (
  loadouts: ReadonlyArray<Loadout>,
  id: string,
  offset: -1 | 1,
): ReadonlyArray<Loadout> => {
  const index = loadouts.findIndex((loadout) => loadout.id === id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= loadouts.length) return loadouts
  const next = [...loadouts]
  const [moved] = next.splice(index, 1)
  if (moved !== undefined) next.splice(target, 0, moved)
  return next
}

export const renameLoadout = (
  loadouts: ReadonlyArray<Loadout>,
  id: string,
  name: string,
): ReadonlyArray<Loadout> => {
  const trimmed = name.trim().slice(0, 48)
  if (trimmed === "") return loadouts
  return loadouts.map((loadout) => (loadout.id === id ? { ...loadout, name: trimmed } : loadout))
}
