import { access, mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  DICTATION_MODELS,
  type DictationModel,
  type DictationStatus,
  type TranscribeAudioInput,
} from "@meldshell/contracts"
import type { DictationWorkerMessage, DictationWorkerRequest } from "./dictation-worker"
import type { HostProcess } from "./platform"

/** The worker holds a model in memory, so it leaves once dictation has gone quiet. */
const IDLE_MS = 5 * 60_000

const MODELS = Object.keys(DICTATION_MODELS) as DictationModel[]

/** Written once a model has loaded, so a download cut short never reads as installed. */
const marker = (cacheDir: string, model: DictationModel) =>
  join(cacheDir, DICTATION_MODELS[model].id, ".meldshell-ready")

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

/** Models download into the data folder, beside the database. */
const dictationCacheDir = (databasePath: string): string => join(dirname(databasePath), "models")

/** Puts what went wrong in terms of the person's network rather than the runtime's. */
function explain(message: string): string {
  if (
    /huggingface\.co|fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i.test(message)
  )
    return "Could not download the speech model from Hugging Face. Check this computer's internet connection and try again."
  return message
}

export interface Dictation {
  readonly status: (model: DictationModel) => Promise<DictationStatus>
  readonly prepare: (model: DictationModel) => Promise<DictationStatus>
  readonly transcribe: (
    model: DictationModel,
    input: TranscribeAudioInput,
  ) => Promise<{ readonly text: string }>
  readonly shutdown: () => void
}

export function createDictation(
  fork: (entry: string, label: string, env?: Record<string, string>) => HostProcess,
  cacheDir: string,
  idleMs = IDLE_MS,
): Dictation {
  let worker: HostProcess | null = null
  let idle: ReturnType<typeof setTimeout> | null = null
  let nextId = 1
  const pending = new Map<
    number,
    { model: DictationModel; resolve: (message: DictationWorkerMessage) => void }
  >()
  const progress = new Map<DictationModel, number>()
  const failures = new Map<DictationModel, string>()

  const stop = () => {
    if (idle) clearTimeout(idle)
    idle = null
    const current = worker
    worker = null
    current?.kill()
  }
  const settle = () => {
    if (idle) clearTimeout(idle)
    idle = pending.size === 0 ? setTimeout(stop, idleMs) : null
    idle?.unref?.()
  }

  const start = (): HostProcess => {
    if (worker) return worker
    const child = fork("dictation-worker.js", "MeldShell dictation", {
      MELDSHELL_DICTATION_CACHE: cacheDir,
    })
    child.on("message", (raw) => {
      const message = raw as DictationWorkerMessage
      if (message.type === "progress") {
        const model = MODELS.find((entry) => DICTATION_MODELS[entry].id === message.model)
        if (model) progress.set(model, message.progress)
        return
      }
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      request.resolve(message)
      settle()
    })
    child.once("exit", () => {
      if (worker === child) worker = null
      for (const [id, request] of pending) {
        pending.delete(id)
        request.resolve({ type: "error", id, message: "The speech model stopped unexpectedly." })
      }
    })
    worker = child
    return child
  }

  const ask = async (
    model: DictationModel,
    request:
      | Omit<Extract<DictationWorkerRequest, { type: "prepare" }>, "id" | "model">
      | Omit<Extract<DictationWorkerRequest, { type: "transcribe" }>, "id" | "model">,
  ): Promise<DictationWorkerMessage> => {
    const id = nextId++
    const reply = new Promise<DictationWorkerMessage>((resolve) =>
      pending.set(id, { model, resolve }),
    )
    if (idle) clearTimeout(idle)
    idle = null
    const ready = await exists(marker(cacheDir, model))
    if (!ready) {
      failures.delete(model)
      progress.set(model, progress.get(model) ?? 0)
    }
    start().postMessage({ ...request, id, model: DICTATION_MODELS[model].id })
    const message = await reply
    if (!ready) progress.delete(model)
    if (message.type === "error") {
      failures.set(model, explain(message.message))
      throw new Error(explain(message.message))
    }
    if (!ready)
      await mkdir(dirname(marker(cacheDir, model)), { recursive: true })
        .then(() => writeFile(marker(cacheDir, model), ""))
        .catch(() => undefined)
    return message
  }

  const status = async (model: DictationModel): Promise<DictationStatus> => {
    const downloaded: DictationModel[] = []
    for (const entry of MODELS) if (await exists(marker(cacheDir, entry))) downloaded.push(entry)
    const downloading = progress.get(model)
    const error = failures.get(model) ?? null
    return {
      model,
      state: downloaded.includes(model)
        ? "ready"
        : downloading !== undefined
          ? "downloading"
          : error !== null
            ? "error"
            : "missing",
      progress: downloading ?? null,
      error,
      downloaded,
    }
  }

  // Models being loaded on request, so repeated prepares share one load.
  const preparing = new Set<DictationModel>()

  return {
    status,
    prepare: async (model) => {
      // Loading continues in the background, so a model that went idle is back in memory by the
      // time speech ends. A first use downloads it too, and the status reports the progress.
      if (!preparing.has(model)) {
        preparing.add(model)
        void ask(model, { type: "prepare" })
          .catch(() => undefined)
          .finally(() => preparing.delete(model))
      }
      return status(model)
    },
    transcribe: async (model, input) => {
      if (input.pcm.length === 0) throw new Error("The recording was empty.")
      const message = await ask(model, {
        type: "transcribe",
        pcm: input.pcm,
        language: input.language ?? null,
      })
      return { text: message.type === "result" ? message.text : "" }
    },
    shutdown: stop,
  }
}

let shared: Dictation | null = null

/** One worker serves every client of this host. */
export const hostDictation = (
  fork: (entry: string, label: string, env?: Record<string, string>) => HostProcess,
  databasePath: string,
): Dictation => {
  shared ??= createDictation(fork, dictationCacheDir(databasePath))
  return shared
}

export const stopDictation = (): void => shared?.shutdown()
