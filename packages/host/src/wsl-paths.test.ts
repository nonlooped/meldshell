import assert from "node:assert/strict"
import { test } from "node:test"
import { distributionNames, windowsWslPath, wslPath } from "./wsl-paths"

test("both WSL shares preserve Linux path spelling and Unicode", () => {
  for (const server of ["wsl$", "wsl.localhost", "WSL.LOCALHOST"])
    assert.equal(
      wslPath(`\\\\${server}\\Ubuntu\\home\\alex\\My Project\\日本語`, "Ubuntu"),
      "/home/alex/My Project/日本語",
    )
  assert.equal(wslPath("//wsl.localhost/Ubuntu/", "ubuntu"), "/")
  assert.equal(wslPath("\\\\wsl$\\Ubuntu", "Ubuntu"), "/")
  assert.equal(
    windowsWslPath("/home/Alex/My Project", "Ubuntu"),
    "\\\\wsl.localhost\\Ubuntu\\home\\Alex\\My Project",
  )
})

test("other distributions and arbitrary network shares cannot become this host's paths", () => {
  assert.throws(() => wslPath("\\\\wsl$\\Debian\\home\\alex", "Ubuntu"), /belongs to Debian/)
  assert.equal(wslPath("\\\\server\\share\\project", "Ubuntu"), null)
  assert.equal(wslPath("C:\\projects\\test", "Ubuntu"), null)
  assert.throws(() => windowsWslPath("relative", "Ubuntu"), /cannot be opened/)
  assert.throws(() => windowsWslPath("/home/name\\file", "Ubuntu"), /cannot be opened/)
})

test("distribution discovery handles Windows UTF-16LE and UTF-8 without truncating names", () => {
  assert.deepEqual(
    distributionNames(Buffer.from("\uFEFFUbuntu\r\nDebian Work\r\nUbuntu\r\n", "utf16le")),
    ["Ubuntu", "Debian Work"],
  )
  assert.deepEqual(distributionNames(Buffer.from("Ubuntu\nDebian\n")), ["Ubuntu", "Debian"])
})
