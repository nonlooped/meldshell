import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { PipeClient } from "../apps/desktop/src/main/runtime/pipe-client"
import { IPC } from "@meldshell/contracts/ipc"
import type { AppSnapshot } from "@meldshell/contracts"

test("captured Effect consoles cannot write diagnostics into the desktop protocol", async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    `
      import { Effect } from "effect"
      import { routeDiagnosticsToStderr } from "./apps/host/src/diagnostics.ts"
      routeDiagnosticsToStderr()
      Effect.runSync(Effect.logError("diagnostic-marker"))
      console.log("console-marker")
      process.stdout.write("protocol-only\\n")
    `,
  ])
  assert.equal(stdout, "protocol-only\n")
  assert.match(stderr, /diagnostic-marker/)
  assert.match(stderr, /console-marker/)
})

test("Linux desktop bridge persists workspaces and shuts down on pipe EOF", {
  skip: process.platform !== "linux",
  timeout: 90_000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-wsl-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const entry = process.env.MELDSHELL_TEST_WSL_BUNDLE
  const terminalEvents: { channel: string; args: readonly unknown[] }[] = []
  const terminalExit = Promise.withResolvers<void>()
  const start = async () => {
    const child = spawn(
      process.execPath,
      entry ? [resolve(entry)] : ["--import", "tsx", "apps/host/src/desktop.ts"],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          PATH: directory,
          SHELL: "/bin/sh",
          WSL_DISTRO_NAME: "MeldShellTest",
          MELDSHELL_WSL_DATA_DIR: join(directory, "data"),
          // Do not probe installed/authenticated agents in a regression test.
          MELDSHELL_CLAUDE_EXECUTABLE: join(directory, "missing-claude"),
          MELDSHELL_CURSOR_EXECUTABLE: join(directory, "missing-cursor"),
        },
      },
    )
    const exited = once(child, "exit")
    t.after(() => child.kill())
    const client = new PipeClient(
      child,
      (channel, args) => {
        terminalEvents.push({ channel, args })
        if (channel === IPC.terminalExit) terminalExit.resolve()
      },
      () => undefined,
      60_000,
    )
    await client.waitUntilReady()
    return { child, client, exited }
  }
  const first = await start()
  assert.equal((await first.client.request("info")).distribution, "MeldShellTest")
  assert.equal(
    await first.client.request(
      "toHostPath",
      "\\\\wsl.localhost\\MeldShellTest\\home\\Name With Spaces",
    ),
    "/home/Name With Spaces",
  )
  await assert.rejects(
    first.client.request("toHostPath", "\\\\wsl$\\Other\\home"),
    /belongs to Other/,
  )
  await first.client.request("addWorkspace", directory)
  const snapshot = (await first.client.request("call", IPC.getSnapshot, [])) as AppSnapshot
  assert.ok(snapshot.workspaces.some((workspace) => workspace.path === directory))
  // The standalone package check installs the Linux addon; source-only CI needs no native build.
  if (entry) {
    const workspaceId = snapshot.workspaces.find((workspace) => workspace.path === directory)!.id
    const created = (await first.client.request("call", IPC.createThread, [
      { workspaceId },
    ])) as AppSnapshot
    const threadId = created.threads[0]!.id
    const terminal = await first.client.request("terminal.open", {
      id: "terminal",
      workspaceId,
      threadId,
      cols: 80,
      rows: 24,
    })
    assert.equal(terminal.cwd, directory)
    assert.equal(terminal.shell, "sh")
    first.client.notify("terminal.resize", "terminal", 93, 29)
    first.client.notify(
      "terminal.write",
      "terminal",
      'printf "WORKSPACE=%s\\n" "$MELDSHELL_WORKSPACE_PATH"; /usr/bin/stty size; exit\r',
    )
    await terminalExit.promise
    const output = terminalEvents
      .filter((event) => event.channel === IPC.terminalData)
      .map((event) => event.args[1])
      .join("")
    assert.ok(output.includes(`WORKSPACE=${directory}`), output)
    assert.ok(output.includes("29 93"), output)
  }
  first.child.stdin.end()
  assert.equal((await first.exited)[0], 0)
  const second = await start()
  const recovered = (await second.client.request("call", IPC.getSnapshot, [])) as AppSnapshot
  assert.ok(recovered.workspaces.some((workspace) => workspace.path === directory))
  await second.client.close()
  assert.equal((await second.exited)[0], 0)
})
