import assert from "node:assert/strict"
import { test } from "node:test"
import {
  actionForEvent,
  ariaShortcut,
  chordFromEvent,
  chordProblem,
  normalizeChord,
  overridesFor,
  resolveKeybindings,
} from "./keybindings"

const press = (
  key: string,
  code: string,
  modifiers: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {},
) => ({ key, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers })

test("chords name modifiers in a fixed order and letters by layout", () => {
  assert.equal(chordFromEvent(press("k", "KeyK", { ctrlKey: true })), "Ctrl+K")
  assert.equal(
    chordFromEvent(press("K", "KeyK", { shiftKey: true, ctrlKey: true, altKey: true })),
    "Ctrl+Alt+Shift+K",
  )
  // AZERTY puts Z where QWERTY has W; the printed letter wins.
  assert.equal(chordFromEvent(press("z", "KeyW", { ctrlKey: true })), "Ctrl+Z")
})

test("symbols and shifted digits are named by key position", () => {
  assert.equal(chordFromEvent(press("`", "Backquote", { ctrlKey: true })), "Ctrl+`")
  assert.equal(
    chordFromEvent(press("!", "Digit1", { ctrlKey: true, shiftKey: true })),
    "Ctrl+Shift+1",
  )
  assert.equal(
    chordFromEvent(press("Tab", "Tab", { ctrlKey: true, shiftKey: true })),
    "Ctrl+Shift+Tab",
  )
  assert.equal(chordFromEvent(press("F5", "F5")), "F5")
})

test("a lone modifier is not a chord", () => {
  assert.equal(chordFromEvent(press("Control", "ControlLeft", { ctrlKey: true })), null)
})

test("stored chords are normalized and bad ones rejected", () => {
  assert.equal(normalizeChord("shift+ctrl+k"), "Ctrl+Shift+K")
  assert.equal(normalizeChord("Ctrl+`"), "Ctrl+`")
  assert.equal(normalizeChord("Hyper+K"), null)
  assert.equal(normalizeChord(""), null)
})

test("overrides replace defaults and an empty chord removes a shortcut", () => {
  const bindings = resolveKeybindings({
    newThread: "Ctrl+Shift+N",
    closeTab: "",
    unknown: "Ctrl+Q",
  })
  assert.equal(bindings.newThread, "Ctrl+Shift+N")
  assert.equal(bindings.closeTab, "")
  assert.equal(bindings.threadPalette, "Ctrl+K")
  assert.deepEqual(overridesFor(bindings), { newThread: "Ctrl+Shift+N", closeTab: "" })
  assert.equal(actionForEvent(press("w", "KeyW", { ctrlKey: true }), bindings), null)
  assert.equal(
    actionForEvent(press("N", "KeyN", { ctrlKey: true, shiftKey: true }), bindings),
    "newThread",
  )
})

test("chords that would swallow typing or editing are refused", () => {
  assert.notEqual(chordProblem("K"), null)
  assert.notEqual(chordProblem("Shift+K"), null)
  assert.notEqual(chordProblem("Ctrl+C"), null)
  assert.notEqual(chordProblem("Escape"), null)
  assert.equal(chordProblem("F6"), null)
  assert.equal(chordProblem("Alt+K"), null)
})

test("hints announce the chord in effect, or nothing once it is removed", () => {
  assert.equal(ariaShortcut("Ctrl+Shift+K"), "Control+Shift+K")
  assert.equal(ariaShortcut("Alt+F4"), "Alt+F4")
  assert.equal(ariaShortcut(""), undefined)
})
