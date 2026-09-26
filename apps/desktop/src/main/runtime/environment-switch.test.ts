import assert from "node:assert/strict"
import { test } from "node:test"
import { createEnvironmentSwitcher } from "./environment-switch"

function fixture(confirm = true) {
  const calls: string[] = []
  const actions = {
    current: async () => "windows" as const,
    confirm: async () => {
      calls.push("confirm")
      return confirm
    },
    save: async (mode: string) => {
      calls.push(`save:${mode}`)
    },
    restart: () => {
      calls.push("restart")
    },
  }
  return { calls, actions }
}

test("switch saves the mode before restarting", async () => {
  const f = fixture()
  assert.equal(await createEnvironmentSwitcher(f.actions)("wsl"), true)
  assert.deepEqual(f.calls, ["confirm", "save:wsl", "restart"])
})

test("cancel, unchanged mode, and invalid IPC input never save or restart", async () => {
  const f = fixture(false)
  const change = createEnvironmentSwitcher(f.actions)
  assert.equal(await change("windows"), false)
  assert.deepEqual(f.calls, [])
  await assert.rejects(change("linux"), /Choose Windows or WSL/)
  assert.equal(await change("wsl"), false)
  assert.deepEqual(f.calls, ["confirm"])
})

test("a failed save leaves the running host alone and allows retry", async () => {
  const f = fixture()
  let fail = true
  const change = createEnvironmentSwitcher({
    ...f.actions,
    save: async () => {
      if (fail) throw new Error("Disk full")
    },
  })
  await assert.rejects(change("wsl"), /Disk full/)
  assert.deepEqual(f.calls, ["confirm"])
  fail = false
  assert.equal(await change("wsl"), true)
  assert.deepEqual(f.calls, ["confirm", "confirm", "restart"])
})

test("overlapping switch requests cannot open another prompt or restart twice", async () => {
  const f = fixture()
  let answer!: (value: boolean) => void
  const change = createEnvironmentSwitcher({
    ...f.actions,
    confirm: () =>
      new Promise<boolean>((resolve) => {
        answer = resolve
      }),
  })
  const first = change("wsl")
  await Promise.resolve()
  assert.equal(await change("wsl"), false)
  answer(true)
  assert.equal(await first, true)
  assert.deepEqual(f.calls, ["save:wsl", "restart"])
})
