import assert from "node:assert/strict"
import test from "node:test"
import type { Provider } from "@meldshell/contracts"
import { useViewStore } from "../packages/ui/src/app/view-store.ts"
import { searchSettings } from "../packages/ui/src/settings/settings-search.ts"

const capabilities = { editor: true, environment: true, hostControl: true }

test("search aliases reach the relocated settings and their correct subsections", () => {
  const cases = [
    ["wsl", "Execution environment", "app", undefined],
    ["voice accurate", "Speech model", "keyboard", "dictation"],
    ["quota", "Subscription usage", "providers", "usage"],
    ["chime", "Notification sounds", "threads", undefined],
    ["nightly", "Release channel", "app", undefined],
    ["shortcut dictate", "Start or stop dictation", "keyboard", "shortcuts"],
  ] as const
  for (const [query, label, section, subsection] of cases) {
    const entry = searchSettings(query, [], capabilities).find((item) => item.label === label)
    assert.ok(entry, query)
    assert.equal(entry.section, section)
    assert.equal(entry.subsection, subsection)
  }
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
  assert.equal(results[0]?.subsection, "configuration")
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
  view.openSettings("providers", "usage")
  view.openSchedules()
  assert.equal(useViewStore.getState().settingsOpen, false)
  assert.equal(useViewStore.getState().schedulesOpen, true)
  view.openSettings()
  assert.equal(useViewStore.getState().schedulesOpen, false)
  assert.equal(useViewStore.getState().settingsSection, "providers")
  assert.equal(useViewStore.getState().settingsSubsection, "usage")
  view.openSettings("keyboard", "dictation")
  view.closeWorkbenchViews()
  assert.equal(useViewStore.getState().settingsOpen, false)
  assert.equal(useViewStore.getState().schedulesOpen, false)
  view.openSettings()
  assert.equal(useViewStore.getState().settingsSubsection, "dictation")
  view.selectSettingsSection("providers")
  assert.equal(useViewStore.getState().settingsSubsection, "configuration")
  view.closeWorkbenchViews()
})
