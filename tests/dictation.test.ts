import assert from "node:assert/strict"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, test } from "node:test"
import {
  dictationStatus,
  setDictationSettings,
  transcribeAudio,
} from "../packages/host/src/dictation"
import { insertDictation } from "../packages/ui/src/threads/dictation-recorder"

let directory = ""
let codexHome = ""
const saved = { key: process.env.OPENAI_API_KEY, codex: process.env.CODEX_HOME }

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "meldshell-dictation-"))
  codexHome = await mkdtemp(join(tmpdir(), "meldshell-codex-"))
  delete process.env.OPENAI_API_KEY
  process.env.CODEX_HOME = codexHome
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
  await rm(codexHome, { recursive: true, force: true })
  if (saved.key === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = saved.key
  if (saved.codex === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = saved.codex
})

test("dictation looks for a key in settings, then the environment, then Codex", async () => {
  assert.deepEqual(await dictationStatus(directory), {
    ready: false,
    source: null,
    keyHint: null,
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini-transcribe",
  })

  await writeFile(join(codexHome, "auth.json"), JSON.stringify({ OPENAI_API_KEY: "sk-codex-1111" }))
  assert.equal((await dictationStatus(directory)).source, "codex")

  process.env.OPENAI_API_KEY = "sk-env-2222"
  assert.deepEqual(await dictationStatus(directory), {
    ready: true,
    source: "environment",
    keyHint: "…2222",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini-transcribe",
  })

  const status = await setDictationSettings(directory, { apiKey: " sk-saved-3333 " })
  assert.equal(status.source, "settings")
  assert.equal(status.keyHint, "…3333")
  assert.equal(JSON.stringify(status).includes("sk-saved"), false)
  if (process.platform !== "win32")
    assert.equal((await stat(join(directory, "dictation.json"))).mode & 0o777, 0o600)

  assert.equal((await setDictationSettings(directory, { apiKey: "" })).source, "environment")
})

test("a custom service never receives the environment's OpenAI key and may need none", async () => {
  process.env.OPENAI_API_KEY = "sk-env-2222"
  const status = await setDictationSettings(directory, {
    endpoint: "http://localhost:8000/v1/",
    model: "whisper-large-v3-turbo",
  })
  assert.deepEqual(status, {
    ready: true,
    source: null,
    keyHint: null,
    endpoint: "http://localhost:8000/v1",
    model: "whisper-large-v3-turbo",
  })
  await assert.rejects(setDictationSettings(directory, { endpoint: "file:///etc" }), /https:\/\//)
})

test("transcription posts the recording to the service and returns its text", async () => {
  await setDictationSettings(directory, { apiKey: "sk-saved-3333" })
  let url = ""
  let init: RequestInit | undefined
  const result = await transcribeAudio(
    directory,
    {
      audio: Buffer.from("audio bytes").toString("base64"),
      mimeType: "audio/webm;codecs=opus",
      prompt: "Refactor the composer",
    },
    async (input, options) => {
      url = String(input)
      init = options
      return Response.json({ text: " add a microphone button. " })
    },
  )
  assert.deepEqual(result, { text: "add a microphone button." })
  assert.equal(url, "https://api.openai.com/v1/audio/transcriptions")
  assert.deepEqual(init?.headers, { Authorization: "Bearer sk-saved-3333" })
  const form = init?.body as FormData
  const file = form.get("file") as File
  assert.equal(file.name, "dictation.webm")
  assert.equal(file.type, "audio/webm")
  assert.equal(await file.text(), "audio bytes")
  assert.equal(form.get("model"), "gpt-4o-mini-transcribe")
  assert.equal(form.get("prompt"), "Refactor the composer")
})

test("transcription explains a missing or rejected key", async () => {
  const audio = { audio: Buffer.from("x").toString("base64"), mimeType: "audio/mp4" }
  await assert.rejects(transcribeAudio(directory, audio), /Add an OpenAI API key/)
  await setDictationSettings(directory, { apiKey: "sk-bad" })
  await assert.rejects(
    transcribeAudio(directory, audio, async () =>
      Response.json({ error: { message: "Incorrect API key" } }, { status: 401 }),
    ),
    /rejected the API key/,
  )
})

test("dictated text is spaced from the words around the caret", () => {
  assert.deepEqual(insertDictation("", 0, 0, "Hello"), {
    draft: "Hello",
    insert: "Hello",
    caret: 5,
  })
  assert.deepEqual(insertDictation("Fix the", 7, 7, "tests"), {
    draft: "Fix the tests",
    insert: " tests",
    caret: 13,
  })
  assert.equal(insertDictation("Fix  bug", 4, 4, "the").draft, "Fix the bug")
  assert.equal(insertDictation("Fix bug.", 3, 3, "the").draft, "Fix the bug.")
  assert.equal(insertDictation("Run it.", 6, 6, "again").draft, "Run it again.")
  assert.equal(insertDictation("Replace this", 8, 12, "that").draft, "Replace that")
})
