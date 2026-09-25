import { refractor } from "refractor"
import jsx from "refractor/jsx"
import tsx from "refractor/tsx"
import powershell from "refractor/powershell"

refractor.register(jsx)
refractor.register(tsx)
refractor.register(powershell)

const languages: Readonly<Record<string, string>> = {
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  jsonc: "javascript",
  ps1: "powershell",
  psm1: "powershell",
  rs: "rust",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  vue: "markup",
  svelte: "markup",
}

export { refractor }

export function sourceLanguage(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  return languages[extension] ?? extension
}

export function sourceTokens(text: string, path: string, language = sourceLanguage(path)) {
  if (text.length > 100_000 || text.split("\n").some((line) => line.length > 2_000))
    return undefined
  if (!refractor.registered(language)) return undefined
  try {
    return refractor.highlight(text, language).children
  } catch {
    return undefined
  }
}
