import assert from "node:assert/strict"
import test from "node:test"
import { Schema } from "effect"
import {
  Loadouts,
  type AppSnapshot,
  type Loadout,
  type Provider,
  type ProviderModel,
} from "@meldshell/contracts"
import { resolveSelection } from "../packages/ui/src/data/catalog.ts"
import { handleAppShortcut } from "../packages/ui/src/app/app-shortcuts.ts"
import { actionForEvent, useKeybindings } from "../packages/ui/src/app/keybindings.ts"
import {
  activeLoadout,
  describeSelection,
  loadoutFromSelection,
  loadoutSelection,
  loadoutSettings,
  moveLoadout,
  renameLoadout,
  suggestedLoadoutName,
} from "../packages/ui/src/threads/loadout-model.ts"

const provider = (id: string, harness: string, displayName: string): Provider => ({
  id,
  key: id,
  harness,
  displayName,
  enabled: true,
  sortOrder: 0,
  builtIn: true,
})

const model = (id: string, providerId: string, patch: Partial<ProviderModel> = {}) =>
  ({
    id,
    providerId,
    slug: id,
    displayName: id,
    enabled: true,
    hidden: false,
    sortOrder: 0,
    isDefault: false,
    reasoningEfforts: ["low", "medium", "high"],
    defaultReasoningEffort: "medium",
    supportsFast: false,
    serviceTiers: [],
    ...patch,
  }) as ProviderModel

const snapshot = (loadouts: ReadonlyArray<Loadout> = []): AppSnapshot =>
  ({
    workspaces: [],
    threads: [],
    providers: [provider("claude", "claude-code", "Claude"), provider("codex", "codex", "Codex")],
    models: [
      model("opus", "claude", { displayName: "claude-opus-4-5" }),
      model("gpt", "codex", { displayName: "gpt-5.1-codex" }),
    ],
    threadSettings: [
      {
        threadId: "thread",
        providerId: "claude",
        modelId: "opus",
        reasoningEffort: "high",
        speed: "standard",
        mode: "plan",
        sandbox: "danger-full-access",
        approvalPolicy: "on-request",
      },
    ],
    approvals: [],
    settings: { titleModelId: "current", loadouts },
  }) as unknown as AppSnapshot

const selection = () => resolveSelection(snapshot(), "thread")!

const loadout = (id: string, patch: Partial<Loadout> = {}): Loadout => ({
  ...loadoutFromSelection(selection(), id, id),
  ...patch,
})

test("a loadout saves the composer setup and applies all of it", () => {
  const saved = loadoutFromSelection(selection(), "  Careful plan  ", "one")
  assert.equal(saved.name, "Careful plan")
  assert.deepEqual(loadoutSettings(saved, "other"), {
    threadId: "other",
    modelId: "opus",
    reasoningEffort: "high",
    speed: "standard",
    mode: "plan",
    sandbox: "danger-full-access",
    approvalPolicy: "on-request",
  })
})

test("the active loadout is the one that matches every setting", () => {
  const matching = loadout("match")
  const otherEffort = loadout("effort", { reasoningEffort: "low" })
  assert.equal(activeLoadout([otherEffort, matching], selection())?.id, "match")
  assert.equal(activeLoadout([otherEffort], selection()), undefined)
})

test("a loadout reads in the composer's words", () => {
  assert.equal(
    describeSelection(selection(), false),
    "Claude · Claude Opus 4.5 · High effort · Plan · Accept edits",
  )
  // The always-full setting replaces every permission choice, so the line leaves it out.
  assert.equal(
    describeSelection(selection(), true),
    "Claude · Claude Opus 4.5 · High effort · Plan",
  )
})

test("a loadout whose model was turned off cannot be applied", () => {
  const state = snapshot()
  const off = {
    ...state,
    models: state.models.map((entry) =>
      entry.id === "opus" ? { ...entry, enabled: false } : entry,
    ),
  }
  assert.notEqual(loadoutSelection(state, loadout("one")), null)
  assert.equal(loadoutSelection(off, loadout("one")), null)
})

test("suggested names are taken from the model and stay unique", () => {
  assert.equal(suggestedLoadoutName([], selection()), "Claude Opus 4.5 High")
  assert.equal(
    suggestedLoadoutName([loadout("a", { name: "Claude Opus 4.5 High" })], selection()),
    "Claude Opus 4.5 High 2",
  )
})

test("moving and renaming keep the list in shortcut order", () => {
  const list = [loadout("a"), loadout("b"), loadout("c")]
  assert.deepEqual(
    moveLoadout(list, "c", -1).map((entry) => entry.id),
    ["a", "c", "b"],
  )
  assert.equal(moveLoadout(list, "a", -1), list)
  assert.equal(renameLoadout(list, "b", "  Review  ")[1]?.name, "Review")
  assert.equal(renameLoadout(list, "b", "   "), list)
})

test("at most five loadouts can be stored", () => {
  const decode = Schema.decodeUnknownOption(Loadouts)
  assert.equal(decode([1, 2, 3, 4, 5].map((n) => loadout(`l${n}`))).valueOrUndefined?.length, 5)
  assert.equal(decode([1, 2, 3, 4, 5, 6].map((n) => loadout(`l${n}`)))._tag, "None")
})

const press = (key: string) =>
  ({
    key,
    code: `Digit${key}`,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    defaultPrevented: false,
    target: null,
    prevented: false,
    preventDefault() {
      this.prevented = true
    },
  }) as unknown as KeyboardEvent & { prevented: boolean }

test("Ctrl+1 to Ctrl+5 switch to the loadout in that place", () => {
  // The handler checks whether a key press came from a dialog; these presses come from nowhere.
  globalThis.Element ??= class {} as unknown as typeof Element
  const { bindings } = useKeybindings.getState()
  assert.equal(actionForEvent(press("1"), bindings), "loadout1")
  assert.equal(actionForEvent(press("5"), bindings), "loadout5")
  assert.equal(actionForEvent(press("6"), bindings), null)

  const applied: number[] = []
  const actions = {
    applyLoadout: (slot: number) => applied.push(slot),
    loadoutCount: 2,
  } as unknown as Parameters<typeof handleAppShortcut>[2]
  const second = press("2")
  handleAppShortcut(second, bindings, actions)
  assert.deepEqual(applied, [1])
  assert.equal(second.prevented, true)

  // An empty place leaves the key alone, as does a window with no thread in front.
  const third = press("3")
  handleAppShortcut(third, bindings, actions)
  handleAppShortcut(press("1"), bindings, { ...actions, applyLoadout: null })
  assert.deepEqual(applied, [1])
  assert.equal(third.prevented, false)
})
