import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Schema } from "effect"
import {
  DEFAULT_DICTATION_ENDPOINT,
  DEFAULT_DICTATION_MODEL,
  type DictationKeySource,
  type DictationStatus,
  type SetDictationSettingsInput,
  type TranscribeAudioInput,
} from "@meldshell/contracts"

/*
 * Dictation settings live beside the database in a file only this user can read, never in the
 * settings table: the snapshot carries that table to every connected device.
 */

const Stored = Schema.Struct({
  apiKey: Schema.optional(Schema.String),
  endpoint: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
})
type Stored = typeof Stored.Type

const CodexAuth = Schema.Struct({ OPENAI_API_KEY: Schema.optional(Schema.NullOr(Schema.String)) })

const settingsFile = (directory: string) => join(directory, "dictation.json")

async function readStored(directory: string): Promise<Stored> {
  try {
    return Schema.decodeUnknownSync(Stored)(
      JSON.parse(await readFile(settingsFile(directory), "utf8")),
    )
  } catch {
    return {}
  }
}

/** Codex keeps an API key here when it signs in with one rather than with ChatGPT. */
async function readCodexKey(
  home = process.env.CODEX_HOME ?? join(homedir(), ".codex"),
): Promise<string | null> {
  try {
    const auth = Schema.decodeUnknownSync(CodexAuth)(
      JSON.parse(await readFile(join(home, "auth.json"), "utf8")),
    )
    return auth.OPENAI_API_KEY?.trim() || null
  } catch {
    return null
  }
}

interface Resolved {
  readonly key: string | null
  readonly source: DictationKeySource | null
  readonly endpoint: string
  readonly model: string
}

async function resolve(directory: string): Promise<Resolved> {
  const stored = await readStored(directory)
  const endpoint = stored.endpoint?.trim().replace(/\/+$/, "") || DEFAULT_DICTATION_ENDPOINT
  const model = stored.model?.trim() || DEFAULT_DICTATION_MODEL
  const configured = stored.apiKey?.trim()
  if (configured) return { key: configured, source: "settings", endpoint, model }
  // Environment and Codex keys belong to OpenAI; they are never sent to another service.
  if (endpoint === DEFAULT_DICTATION_ENDPOINT) {
    const environment = process.env.OPENAI_API_KEY?.trim()
    if (environment) return { key: environment, source: "environment", endpoint, model }
    const codex = await readCodexKey()
    if (codex) return { key: codex, source: "codex", endpoint, model }
  }
  return { key: null, source: null, endpoint, model }
}

const statusOf = ({ key, source, endpoint, model }: Resolved): DictationStatus => ({
  // A custom endpoint, such as a local Whisper server, may need no key.
  ready: key !== null || endpoint !== DEFAULT_DICTATION_ENDPOINT,
  source,
  keyHint: key === null ? null : `…${key.slice(-4)}`,
  endpoint,
  model,
})

export const dictationStatus = async (directory: string): Promise<DictationStatus> =>
  statusOf(await resolve(directory))

export async function setDictationSettings(
  directory: string,
  input: SetDictationSettingsInput,
): Promise<DictationStatus> {
  const stored = await readStored(directory)
  const endpoint = input.endpoint?.trim()
  if (endpoint) {
    const url = URL.canParse(endpoint) ? new URL(endpoint) : null
    if (url === null || (url.protocol !== "https:" && url.protocol !== "http:"))
      throw new Error("Enter the service's address, starting with https:// or http://.")
  }
  const next: Record<string, string> = {}
  const apiKey = input.apiKey === undefined ? stored.apiKey : input.apiKey.trim()
  const nextEndpoint = input.endpoint === undefined ? stored.endpoint : endpoint
  const model = input.model === undefined ? stored.model : input.model.trim()
  if (apiKey) next.apiKey = apiKey
  if (nextEndpoint) next.endpoint = nextEndpoint
  if (model) next.model = model
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = settingsFile(directory)
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 })
  await chmod(temporary, 0o600)
  await rename(temporary, file)
  return dictationStatus(directory)
}

/** The upload's file name tells the service its container; codec parameters are dropped. */
function fileName(mimeType: string): string {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? ""
  const extension =
    {
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/mp4": "mp4",
      "audio/x-m4a": "m4a",
      "audio/aac": "m4a",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
    }[type] ?? "webm"
  return `dictation.${extension}`
}

/** The service's own explanation when it gives one, phrased for the composer otherwise. */
async function failure(response: Response): Promise<Error> {
  let detail = ""
  try {
    const body = (await response.json()) as { error?: { message?: unknown } | string }
    detail =
      typeof body.error === "string"
        ? body.error
        : typeof body.error?.message === "string"
          ? body.error.message
          : ""
  } catch {
    // A body that is not JSON leaves only the status to go on.
  }
  if (response.status === 401 || response.status === 403)
    return new Error("The transcription service rejected the API key. Check it in Settings.")
  if (response.status === 429)
    return new Error(detail || "The transcription service is rate limiting requests. Try again.")
  return new Error(
    detail
      ? `Transcription failed: ${detail}`
      : `Transcription failed with status ${response.status}.`,
  )
}

export async function transcribeAudio(
  directory: string,
  input: TranscribeAudioInput,
  request: typeof fetch = fetch,
): Promise<{ readonly text: string }> {
  const { key, endpoint, model } = await resolve(directory)
  if (key === null && endpoint === DEFAULT_DICTATION_ENDPOINT)
    throw new Error("Add an OpenAI API key in Settings to use dictation.")
  const audio = Buffer.from(input.audio, "base64")
  if (audio.length === 0) throw new Error("The recording was empty.")
  const form = new FormData()
  form.append(
    "file",
    new Blob([audio], { type: input.mimeType.split(";")[0] ?? "" }),
    fileName(input.mimeType),
  )
  form.append("model", model)
  form.append("response_format", "json")
  // The service reads only the end of a prompt, so send the text nearest the caret.
  const prompt = input.prompt?.trim().slice(-800)
  if (prompt) form.append("prompt", prompt)
  let response: Response
  try {
    response = await request(`${endpoint}/audio/transcriptions`, {
      method: "POST",
      headers: key === null ? {} : { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    })
  } catch (cause) {
    throw new Error(
      cause instanceof Error && cause.name === "TimeoutError"
        ? "The transcription service did not answer in time."
        : `Could not reach the transcription service at ${new URL(endpoint).host}.`,
    )
  }
  if (!response.ok) throw await failure(response)
  const body = (await response.json()) as { text?: unknown }
  if (typeof body.text !== "string")
    throw new Error("The transcription service answered without text.")
  return { text: body.text.trim() }
}

/** Dictation settings share the database's folder. */
export const dictationDirectory = (databasePath: string): string => dirname(databasePath)
