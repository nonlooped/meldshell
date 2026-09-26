import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readDesktopMode, writeDesktopMode } from "./environment-settings"

test("new installs use Windows; existing WSL installs retain their environment", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-environment-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  assert.equal(await readDesktopMode(directory), "windows")
  assert.equal(await readDesktopMode(directory, "Ubuntu"), "wsl")
  await writeFile(join(directory, "wsl.json"), JSON.stringify({ distribution: "Ubuntu" }))
  assert.equal(await readDesktopMode(directory), "wsl")
  await writeDesktopMode(directory, "windows")
  assert.equal(await readDesktopMode(directory, "Ubuntu"), "windows")
  await writeDesktopMode(directory, "wsl")
  assert.equal(await readDesktopMode(directory), "wsl")
})

test("invalid saved configuration falls back to valid legacy settings", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-environment-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, "environment.json"), "broken JSON")
  await writeFile(join(directory, "wsl.json"), JSON.stringify({ distribution: 42 }))
  assert.equal(await readDesktopMode(directory), "windows")
  await writeFile(join(directory, "wsl.json"), JSON.stringify({ distribution: "Debian" }))
  assert.equal(await readDesktopMode(directory), "wsl")
})
