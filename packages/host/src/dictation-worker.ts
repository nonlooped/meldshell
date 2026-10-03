import type { WorkerPort } from "@meldshell/provider-runtime"

/*
 * Runs Whisper on this computer with ONNX Runtime, so dictation needs no account or key. The host
 * starts this process on first use and stops it when dictation has been idle for a while, which
 * returns the model's memory.
 */

export type DictationWorkerRequest =
  | { readonly id: number; readonly type: "prepare"; readonly model: string }
  | {
      readonly id: number
      readonly type: "transcribe"
      readonly model: string
      /** 16 kHz mono 16-bit PCM, base64 encoded. */
      readonly pcm: string
      /** An ISO 639-1 code such as `en`, or null to let the model decide. */
      readonly language: string | null
    }

export type DictationWorkerMessage =
  | { readonly type: "result"; readonly id: number; readonly text: string }
  | { readonly type: "ready"; readonly id: number }
  | { readonly type: "error"; readonly id: number; readonly message: string }
  /** Download progress across the model's files, from 0 to 1. */
  | { readonly type: "progress"; readonly model: string; readonly progress: number }

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>

const pcmToFloat = (pcm: string): Float32Array => {
  const bytes = Buffer.from(pcm, "base64")
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
  const audio = new Float32Array(samples.length)
  for (let index = 0; index < samples.length; index++) audio[index] = samples[index]! / 32768
  return audio
}

export function runDictationWorker(
  port: WorkerPort,
  cacheDir: string,
): { shutdown: () => Promise<void> } {
  const loaded = new Map<string, Promise<Transcriber>>()

  const load = (model: string): Promise<Transcriber> => {
    const existing = loaded.get(model)
    if (existing) return existing
    const files = new Map<string, { loaded: number; total: number }>()
    let reported = -1
    const next = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers")
      env.cacheDir = cacheDir
      env.allowLocalModels = false
      const transcriber = await pipeline("automatic-speech-recognition", model, {
        dtype: "q8",
        device: "cpu",
        progress_callback: (event: {
          status: string
          file?: string
          loaded?: number
          total?: number
        }) => {
          if (event.status !== "progress" || !event.file || !event.total) return
          files.set(event.file, { loaded: event.loaded ?? 0, total: event.total })
          let done = 0
          let total = 0
          for (const file of files.values()) {
            done += file.loaded
            total += file.total
          }
          const progress = Math.floor((done / total) * 100) / 100
          if (progress === reported) return
          reported = progress
          port.postMessage({ type: "progress", model, progress } satisfies DictationWorkerMessage)
        },
      })
      return transcriber as unknown as Transcriber
    })()
    loaded.set(model, next)
    // A failed download is retried on the next request instead of being remembered.
    next.catch(() => loaded.delete(model))
    return next
  }

  // Requests run one at a time: each already uses every core.
  let queue: Promise<unknown> = Promise.resolve()
  const handle = async (request: DictationWorkerRequest): Promise<DictationWorkerMessage> => {
    try {
      const transcriber = await load(request.model)
      if (request.type === "prepare") return { type: "ready", id: request.id }
      const audio = pcmToFloat(request.pcm)
      const options = { chunk_length_s: 30, stride_length_s: 5, task: "transcribe" }
      // A device language Whisper does not know leaves the choice to the model.
      const output = await (request.language
        ? transcriber(audio, { ...options, language: request.language }).catch((cause) => {
            if (cause instanceof Error && /language/i.test(cause.message))
              return transcriber(audio, options)
            throw cause
          })
        : transcriber(audio, options))
      const text = (Array.isArray(output) ? output.map((part) => part.text).join(" ") : output.text)
        .replace(/\s+/g, " ")
        .trim()
      return { type: "result", id: request.id, text }
    } catch (cause) {
      return {
        type: "error",
        id: request.id,
        message: cause instanceof Error ? cause.message : String(cause),
      }
    }
  }

  port.on("message", ({ data }) => {
    const request = data as DictationWorkerRequest
    queue = queue.then(() => handle(request).then((reply) => port.postMessage(reply)))
  })

  return { shutdown: async () => undefined }
}
