import { readFile, writeFile, mkdir, rename } from "node:fs/promises"
import { join } from "node:path"
import type { DesktopMode } from "@meldshell/contracts/ipc"

const readJson = async (file: string): Promise<unknown> =>
  readFile(file, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null)

/** A saved mode wins over distro hints, so Windows mode never starts WSL. */
export async function readDesktopMode(
  directory: string,
  distribution?: string,
): Promise<DesktopMode> {
  const saved = await readJson(join(directory, "environment.json"))
  if (saved && typeof saved === "object" && "mode" in saved) {
    if (saved.mode === "windows" || saved.mode === "wsl") return saved.mode
  }
  const legacy = await readJson(join(directory, "wsl.json"))
  return distribution ||
    (legacy &&
      typeof legacy === "object" &&
      "distribution" in legacy &&
      typeof legacy.distribution === "string" &&
      legacy.distribution)
    ? "wsl"
    : "windows"
}

export async function writeDesktopMode(directory: string, mode: DesktopMode): Promise<void> {
  await mkdir(directory, { recursive: true })
  const file = join(directory, "environment.json")
  await writeFile(`${file}.tmp`, `${JSON.stringify({ mode })}\n`)
  await rename(`${file}.tmp`, file)
}
