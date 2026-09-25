import * as SqlClient from "@effect/sql/SqlClient"
import {
  type ProviderModel,
  type ReasoningEffort,
  type SetThreadTitleInput,
  type TitleRequest,
  CURRENT_TITLE_MODEL,
  defaultReasoningEffort,
  isHarness,
} from "@meldshell/contracts"
import { Effect } from "effect"
import { enabledModel } from "./catalog"
import { getSnapshot } from "./snapshots"
import { readAppSettings } from "./settings"

export const DEFAULT_THREAD_TITLE = "New thread"

/** Bound stored titles independently of the current sidebar width. */
export const THREAD_TITLE_LIMIT = 42

const THREAD_TITLE_WORD_LIMIT = 5

export const resolveThreadTitle = (title: string | undefined): string =>
  title?.trim() || DEFAULT_THREAD_TITLE

/** The placeholder shown from the moment a message is sent until the title model answers. */
export const derivedThreadTitle = (text: string): string =>
  text.split(/\r?\n/, 1)[0]?.trim().slice(0, THREAD_TITLE_LIMIT) ?? ""

/** Limit the user content sent to the title model. */
const TITLE_PROMPT_LIMIT = 2_000

const buildTitlePrompt = (text: string): string =>
  [
    "Name the coding conversation that starts with the message below.",
    `Reply with the title alone: at most ${THREAD_TITLE_WORD_LIMIT} words and`,
    `${THREAD_TITLE_LIMIT} characters, sentence case, no quotes, no trailing period,`,
    "no explanation.",
    "Do not read files, run commands, or use tools.",
    "",
    "Message:",
    text.trim().slice(0, TITLE_PROMPT_LIMIT),
  ].join("\n")

/** Keep the first nonblank line, remove common title decorations, and enforce storage limits. */
const sanitizeGeneratedTitle = (raw: string): string | null => {
  const firstLine = raw.split(/\r?\n/).find((line) => line.trim() !== "")
  if (firstLine === undefined) return null
  const title = firstLine
    .trim()
    .replace(/^(?:thread\s+)?title\s*[:–-]\s*/i, "")
    .replace(/^[\s"'“‘`*_#]+/, "")
    .replace(/[\s"'”’`*_]+$/, "")
    .replaceAll(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim()
  return title === "" ? null : clampTitleLength(title)
}

/** Drop whole words first; truncate a single word only if it exceeds the character limit. */
const clampTitleLength = (title: string): string => {
  const words = title.split(" ").slice(0, THREAD_TITLE_WORD_LIMIT)
  while (words.length > 1 && words.join(" ").length > THREAD_TITLE_LIMIT) words.pop()
  return words.join(" ").slice(0, THREAD_TITLE_LIMIT)
}

/** Prefer a known inexpensive tier for titles; otherwise use the model's default. */
const titleReasoningEffort = (model: ProviderModel): ReasoningEffort | null => {
  const cheapest = ["off", "none", "minimal", "low"].find((effort) =>
    model.reasoningEfforts.includes(effort),
  )
  return cheapest ?? defaultReasoningEffort(model.reasoningEfforts, model.defaultReasoningEffort)
}

/**
 * Builds the one-off turn that names a thread. The configured title model is only a preference: if
 * it has been disabled or deleted since it was chosen, the thread's own model names the thread
 * rather than leaving it with its first line forever.
 */
export const buildTitleRequest = (threadId: string, text: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{
      readonly workspace_path: string
      readonly model_id: string | null
    }>`
      SELECT COALESCE(t.worktree_path, w.path) AS workspace_path, s.model_id
      FROM threads t
      JOIN workspaces w ON w.id = t.workspace_id
      JOIN thread_settings s ON s.thread_id = t.id
      WHERE t.id = ${threadId}
    `
    const row = rows[0]
    if (row === undefined) return null

    const settings = yield* readAppSettings
    const configured =
      settings.titleModelId === CURRENT_TITLE_MODEL
        ? null
        : yield* enabledModel(settings.titleModelId)
    const model = configured ?? (row.model_id === null ? null : yield* enabledModel(row.model_id))
    if (model === null) return null

    const providers = yield* sql<{
      harness: string
    }>`SELECT harness FROM providers WHERE id = ${model.providerId}`
    const harness = providers[0]?.harness
    if (!isHarness(harness)) return null
    return {
      harness,
      threadId,
      workspacePath: row.workspace_path,
      model: model.slug,
      reasoningEffort: titleReasoningEffort(model),
      prompt: buildTitlePrompt(text),
    } satisfies TitleRequest
  })

/** Sanitize a generated title before storing it. Callers own stale-request checks. */
export const setThreadTitle = (input: SetThreadTitleInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const title = sanitizeGeneratedTitle(input.title)
    if (title === null) return yield* getSnapshot
    yield* sql`UPDATE threads SET title = ${title} WHERE id = ${input.threadId}`
    return yield* getSnapshot
  })
