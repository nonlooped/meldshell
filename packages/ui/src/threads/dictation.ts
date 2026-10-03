import { create } from "zustand"
import { MAX_DICTATION_SECONDS } from "@meldshell/contracts"

/** The dictation shortcut reaches the composer of the thread in front through this signal. */
export const useDictationRequests = create<{
  readonly request: { readonly threadId: string; readonly id: number } | null
  readonly toggle: (threadId: string) => void
}>((set) => ({
  request: null,
  toggle: (threadId) =>
    set((state) => ({ request: { threadId, id: (state.request?.id ?? 0) + 1 } })),
}))

// Opus in WebM is Chromium's and Firefox's; Safari, including on phones, records AAC in MP4.
const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
]

/** Whether this device can record at all: secure pages with a microphone API and a recorder. */
export const canRecord = (): boolean =>
  typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia !== undefined

/** Recordings shorter than this are taken as a slip of the finger and discarded. */
const MIN_RECORDING_MS = 400

export interface Recording {
  readonly analyser: AnalyserNode
  readonly startedAt: number
  /** Ends the recording; resolves with its audio, or null when it was cancelled or too short. */
  readonly stop: (keep: boolean) => Promise<{ audio: string; mimeType: string } | null>
}

/** Explains why the microphone could not start, in terms the person can act on. */
export function microphoneProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access is blocked. Allow it in your system or browser settings."
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found."
  if (name === "NotReadableError") return "The microphone is in use by another app."
  return "Could not start the microphone."
}

const base64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the recording."))
    reader.readAsDataURL(blob)
  })

/** Starts recording from the default microphone; throws as `getUserMedia` does. */
export async function startRecording(onLimit: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
  // Speech needs little bandwidth, which keeps long briefs small enough to send from a phone.
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    audioBitsPerSecond: 32_000,
  })
  const chunks: Blob[] = []
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  })
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.6
  context.createMediaStreamSource(stream).connect(analyser)
  const limit = setTimeout(onLimit, MAX_DICTATION_SECONDS * 1000)
  const startedAt = performance.now()
  recorder.start(1000)

  let stopping: Promise<{ audio: string; mimeType: string } | null> | null = null
  const stop = (keep: boolean) => {
    stopping ??= new Promise<Blob>((resolve) => {
      clearTimeout(limit)
      recorder.addEventListener(
        "stop",
        () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" })),
        { once: true },
      )
      if (recorder.state === "inactive") recorder.dispatchEvent(new Event("stop"))
      else recorder.stop()
    }).then(async (blob) => {
      for (const track of stream.getTracks()) track.stop()
      void context.close()
      if (!keep || performance.now() - startedAt < MIN_RECORDING_MS || blob.size === 0) return null
      return { audio: await base64(blob), mimeType: blob.type }
    })
    return stopping
  }
  return { analyser, startedAt, stop }
}

/** `m:ss` for the recording timer. */
export const elapsedLabel = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * The draft with `text` dictated over the selection, spaced from the words around it, and where
 * the caret lands afterwards.
 */
export function insertDictation(
  draft: string,
  start: number,
  end: number,
  text: string,
): { readonly draft: string; readonly insert: string; readonly caret: number } {
  const before = draft.slice(0, start)
  const after = draft.slice(end)
  const insert = `${before !== "" && !/\s$/.test(before) ? " " : ""}${text}${
    after !== "" && !/^[\s.,;:!?)]/.test(after) ? " " : ""
  }`
  return { draft: before + insert + after, insert, caret: start + insert.length }
}

/** A host error without the IPC wrapper Electron puts around it. */
export const dictationError = (cause: unknown): string =>
  String(cause instanceof Error ? cause.message : cause).replace(
    /^(Error: )?(Error invoking remote method '[^']+': )?(Error: )?/,
    "",
  ) || "Transcription failed."
