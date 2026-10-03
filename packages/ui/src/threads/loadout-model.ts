import {
  MAX_LOADOUTS,
  type AppSnapshot,
  type Loadout,
  type SetThreadSettingsInput,
} from "@meldshell/contracts"
import { effortLabel, selectableModels, type Selection } from "../data/catalog"
import { modelLabel } from "../data/model-label"
import { harnessModes, MODES, permissionOptions } from "./composer-options"

/*
 * Loadouts save a thread's composer setup so one shortcut can bring it back. The agent follows from
 * the model, so a loadout names the model and everything the composer offers beside it.
 */

const LOADOUT_FIELDS = [
  "modelId",
  "reasoningEffort",
  "speed",
  "mode",
  "sandbox",
  "approvalPolicy",
] as const

export const loadoutFromSelection = (selection: Selection, name: string, id: string): Loadout => ({
  id,
  name: name.trim().slice(0, 48),
  modelId: selection.model.id,
  reasoningEffort: selection.reasoningEffort,
  speed: selection.speed,
  mode: selection.mode,
  sandbox: selection.sandbox,
  approvalPolicy: selection.approvalPolicy,
})

/** The loadout the composer is set to, if any. */
export const activeLoadout = (
  loadouts: ReadonlyArray<Loadout>,
  selection: Selection,
): Loadout | undefined => {
  const current = loadoutFromSelection(selection, "", "")
  return loadouts.find((loadout) => LOADOUT_FIELDS.every((key) => loadout[key] === current[key]))
}

export const loadoutSettings = (loadout: Loadout, threadId: string): SetThreadSettingsInput => ({
  threadId,
  modelId: loadout.modelId,
  reasoningEffort: loadout.reasoningEffort,
  speed: loadout.speed,
  mode: loadout.mode,
  sandbox: loadout.sandbox,
  approvalPolicy: loadout.approvalPolicy,
})

/** The composer setup a loadout describes, or null once its model can no longer run turns. */
export const loadoutSelection = (snapshot: AppSnapshot, loadout: Loadout): Selection | null => {
  const model = selectableModels(snapshot).find((candidate) => candidate.id === loadout.modelId)
  const provider = snapshot.providers.find((entry) => entry.id === model?.providerId)
  if (model === undefined || provider === undefined) return null
  return {
    provider,
    model,
    reasoningEffort: loadout.reasoningEffort,
    speed: loadout.speed,
    mode: loadout.mode,
    sandbox: loadout.sandbox,
    approvalPolicy: loadout.approvalPolicy,
  }
}

/** One line naming what a loadout sets, as in `Claude · Opus 4.5 · High effort · Accept edits`. */
export const describeSelection = (selection: Selection, fullPermissions: boolean): string => {
  const { model, provider } = selection
  const parts = [provider.displayName, modelLabel(model.displayName)]
  if (
    selection.reasoningEffort !== null &&
    model.reasoningEfforts.includes(selection.reasoningEffort)
  )
    parts.push(`${effortLabel(selection.reasoningEffort)} effort`)
  if (selection.speed === "fast" && model.supportsFast) parts.push("Fast")
  if (selection.mode !== "default" && harnessModes(provider.harness).includes(selection.mode))
    parts.push(MODES[selection.mode].label)
  // Pi has no permission system, and the always-full setting overrides every loadout's choice.
  if (!fullPermissions && provider.harness !== "pi")
    parts.push(permissionOptions(selection).selected.label)
  return parts.join(" · ")
}

/** A first name for a new loadout: its model and effort, numbered if that name is taken. */
export const suggestedLoadoutName = (
  loadouts: ReadonlyArray<Loadout>,
  selection: Selection,
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
