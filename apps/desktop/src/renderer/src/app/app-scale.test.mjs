import assert from "node:assert/strict"
import { test } from "node:test"
import { nextScale, scaleShortcut } from "./app-scale.ts"

class TestElement {
  constructor({ editable = false, insideTextControl = false } = {}) {
    this.isContentEditable = editable
    this.insideTextControl = insideTextControl
  }

  closest() {
    return this.insideTextControl ? this : null
  }
}

globalThis.HTMLElement = TestElement

function shortcutEvent(overrides = {}) {
  return {
    defaultPrevented: false,
    isComposing: false,
    shiftKey: true,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    key: "+",
    code: "Equal",
    target: null,
    ...overrides,
  }
}

test("Shift plus and minus change the app scale", () => {
  assert.equal(scaleShortcut(shortcutEvent()), 1)
  assert.equal(scaleShortcut(shortcutEvent({ key: "_", code: "Minus" })), -1)
})

test("scale shortcuts ignore modified keys and text entry", () => {
  assert.equal(scaleShortcut(shortcutEvent({ shiftKey: false })), 0)
  assert.equal(scaleShortcut(shortcutEvent({ ctrlKey: true })), 0)
  assert.equal(scaleShortcut(shortcutEvent({ target: new TestElement({ editable: true }) })), 0)
  assert.equal(
    scaleShortcut(shortcutEvent({ target: new TestElement({ insideTextControl: true }) })),
    0,
  )
})

test("app scale moves in ten-percent steps within its limits", () => {
  assert.equal(nextScale(100, 1), 110)
  assert.equal(nextScale(100, -1), 90)
  assert.equal(nextScale(150, 1), 150)
  assert.equal(nextScale(70, -1), 70)
})
