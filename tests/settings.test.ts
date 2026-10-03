import assert from "node:assert/strict"
import test from "node:test"
import type { Provider } from "@meldshell/contracts"
import { useViewStore } from "../packages/ui/src/app/view-store.ts"
import { searchSettings } from "../packages/ui/src/settings/settings-search.ts"

const capabilities = { editor: true, environment: true, hostControl: true }

test("search aliases reach the relocated settings and the groups that hold them", () => {
  const cases = [
    ["wsl", "Execution environment", "app", "Runtime & applications"],
    ["voice accurate", "Speech model", "keyboard", "Dictation"],
    ["quota", "Subscription usage", "providers", "Subscription usage"],
    ["chime", "Notification sounds", "threads", "Threads"],
    ["nightly", "Release channel", "app", "Updates"],
    ["shortcut dictate", "Start or stop dictation", "keyboard", "Keyboard shortcuts · Input"],
  ] as const
  for (const [query, label, section, group] of cases) {
    const entry = searchSettings(query, [], capabilities).find((item) => item.label === label)
    assert.ok(entry, query)
    assert.equal(entry.section, section)
    assert.equal(entry.group, group)
  }
})

test("search ranks labels that start with the query above keyword matches", () => {
  const labels = searchSettings("theme", [], capabilities).map((entry) => entry.label)
  assert.equal(labels[0], "Theme")
  const shortcut = searchSettings("new thread", [], capabilities)[0]
  assert.equal(shortcut?.label, "New thread")
  assert.equal(shortcut?.shortcut, "newThread")
})

test("search finds renamed providers, ignores case and whitespace, and requires all terms", () => {
  const provider: Provider = {
    id: "codex",
    key: "codex",
    harness: "codex",
    displayName: "My coding agent",
    enabled: true,
    builtIn: true,
    sortOrder: 0,
  }
  const results = searchSettings("  MY   agent ", [provider], capabilities)
  assert.equal(results.length, 1)
  assert.equal(results[0]?.label, provider.displayName)
  assert.equal(results[0]?.group, "Providers")
  assert.deepEqual(searchSettings("voice quota", [], capabilities), [])
  assert.deepEqual(searchSettings("   ", [], capabilities), [])
})

test("search excludes controls unavailable to the current client", () => {
  const unavailable = { editor: false, environment: false, hostControl: false }
  for (const query of ["Default editor", "Execution environment", "Host controls"]) {
    assert.deepEqual(searchSettings(query, [], unavailable), [])
  }
})

test("workspace schedules and settings are exclusive and closing restores the chosen settings view", () => {
  const view = useViewStore.getState()
  view.openSettings("providers", "Subscription usage")
  assert.equal(useViewStore.getState().settingsTarget, "Subscription usage")
  view.openSchedules()
  assert.equal(useViewStore.getState().settingsOpen, false)
  assert.equal(useViewStore.getState().schedulesOpen, true)
  view.openSettings()
  assert.equal(useViewStore.getState().schedulesOpen, false)
  assert.equal(useViewStore.getState().settingsSection, "providers")
  // Reopening returns to the page without jumping again.
  assert.equal(useViewStore.getState().settingsTarget, null)
  view.selectSettingsSection("keyboard", "Dictation")
  assert.equal(useViewStore.getState().settingsTarget, "Dictation")
  view.clearSettingsTarget()
  assert.equal(useViewStore.getState().settingsTarget, null)
  view.closeWorkbenchViews()
  assert.equal(useViewStore.getState().settingsOpen, false)
  assert.equal(useViewStore.getState().schedulesOpen, false)
})
