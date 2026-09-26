import assert from "node:assert/strict"
import test from "node:test"
import { downloadPlatform } from "./download-platform"

test("desktop platforms select their installer", () => {
  assert.deepEqual(downloadPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), {
    name: "Windows",
    extension: ".exe",
  })
  assert.deepEqual(downloadPlatform("Mozilla/5.0 (X11; Linux x86_64)"), {
    name: "Linux",
    extension: ".AppImage",
  })
})

test("unsupported platforms keep the releases fallback", () => {
  for (const userAgent of [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Mozilla/5.0 (Linux; Android 14) Mobile",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    "Mozilla/5.0 (X11; CrOS x86_64 16000.0.0)",
    "Mozilla/5.0 (X11; Linux aarch64)",
    "",
  ]) {
    assert.equal(downloadPlatform(userAgent), null, userAgent)
  }
})
