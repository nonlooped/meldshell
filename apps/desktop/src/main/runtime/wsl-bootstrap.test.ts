import assert from "node:assert/strict"
import { test } from "node:test"
import { wslArguments, WSL_BOOTSTRAP } from "./wsl-bootstrap"

test("distribution names and payload paths are argv, never interpolated into shell code", () => {
  const distro = "Ubuntu Work"
  const payload = "C:\\Program Files\\MeldShell's $(touch injected)\\日本語"
  const args = wslArguments(distro, payload, "a".repeat(64))
  assert.deepEqual(args.slice(0, 7), [
    "--distribution",
    distro,
    "--cd",
    "~",
    "--exec",
    "/bin/sh",
    "-c",
  ])
  assert.equal(args[9], WSL_BOOTSTRAP)
  assert.equal(args[10], payload)
  assert.equal(args[11], "a".repeat(64))
  assert.ok(!args[7]!.includes(payload))
  assert.ok(!WSL_BOOTSTRAP.includes(payload))
})
