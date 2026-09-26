/** Recognize both Windows names for a WSL filesystem, without treating arbitrary UNC shares as Linux. */
export function wslPath(path: string, distribution: string): string | null {
  const match = /^[/\\]{2}(?:wsl\$|wsl\.localhost)[/\\]([^/\\]+)(.*)$/i.exec(path)
  if (!match) return null
  if (match[1]!.toLowerCase() !== distribution.toLowerCase())
    throw new Error(
      `Choose a folder or attachment in ${distribution}. This path belongs to ${match[1]}.`,
    )
  return match[2]!.replaceAll("\\", "/") || "/"
}

export function windowsWslPath(path: string, distribution: string): string {
  if (!path.startsWith("/") || path.includes("\0") || path.includes("\\"))
    throw new Error("This Linux path cannot be opened by the Windows folder picker.")
  return `\\\\wsl.localhost\\${distribution}${path.replaceAll("/", "\\")}`
}

export function distributionNames(output: Buffer): string[] {
  // wsl.exe management output is UTF-16LE on Windows; some versions emit UTF-8.
  const text = output.includes(0) ? output.toString("utf16le") : output.toString("utf8")
  return [
    ...new Set(
      text
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ]
}
