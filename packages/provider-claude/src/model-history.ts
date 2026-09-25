import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { resolveSettings } from "@anthropic-ai/claude-agent-sdk"
import { asRecord } from "@meldshell/contracts"

const modelId = /^claude-[a-z]+-\d+(?:-\d{1,2})?(?:-\d{8})?$/
/** Public version IDs are candidates only. Claude Code supplies capabilities and applies policy. */
const historyCandidates = (data: unknown): string[] => {
  const models = asRecord(asRecord(asRecord(data).anthropic).models)
  const ids = Object.entries(models)
    .filter(([id, value]) => modelId.test(id) && asRecord(value).status !== "deprecated")
    .sort(
      ([a, av], [b, bv]) =>
        String(asRecord(bv).release_date ?? "").localeCompare(
          String(asRecord(av).release_date ?? ""),
        ) || a.localeCompare(b),
    )
    .map(([id]) => id)
  const available = new Set(ids)
  return ids.filter((id) => !/-\d{8}$/.test(id) || !available.has(id.replace(/-\d{8}$/, "")))
}

export const loadModelHistory = async (signal: AbortSignal): Promise<string[]> => {
  // Respect a curated picker and provider-specific IDs on gateways/cloud deployments.
  const settings = await resolveSettings({ cwd: homedir(), settingSources: ["user"] }).catch(
    () => null,
  )
  if (!settings || settings.effective.modelPicker) return []
  const env = { ...process.env, ...settings.effective.env }
  if (
    env.ANTHROPIC_BASE_URL ||
    ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"].some(
      (key) => env[key] === "1" || env[key] === "true",
    )
  )
    return []
  const directory = join(homedir(), ".cache", "meldshell")
  const cache = join(directory, "claude-model-history.json")
  try {
    const response = await fetch("https://models.dev/api.json", {
      signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
    })
    if (!response.ok) throw new Error(`Model catalog returned ${response.status}`)
    const ids = historyCandidates(await response.json())
    if (ids.length === 0) throw new Error("Model catalog contained no Claude versions")
    // This cache contains public model IDs only; failure to cache does not block discovery.
    await mkdir(directory, { recursive: true })
      .then(() => writeFile(cache, JSON.stringify(ids)))
      .catch(() => undefined)
    return ids
  } catch {
    try {
      const cached: unknown = JSON.parse(await readFile(cache, "utf8"))
      return Array.isArray(cached)
        ? cached.filter((id): id is string => typeof id === "string" && modelId.test(id))
        : []
    } catch {
      return []
    }
  }
}
