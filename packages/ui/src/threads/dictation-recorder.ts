import { create } from "zustand"
import { DICTATION_SAMPLE_RATE, MAX_DICTATION_SECONDS } from "@meldshell/contracts"

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
  /**
   * Ends the recording. Resolves with its speech as base64 16 kHz PCM pieces short enough for a
   * remote frame, or null when it was cancelled or too short.
   */
  readonly stop: (keep: boolean) => Promise<readonly string[] | null>
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

/** Whisper's own window is 30 seconds; pieces end in the quietest moment near this length. */
const PIECE_SECONDS = 50
const PIECE_SEARCH_SECONDS = 10

/** Where to end each piece: the quietest tenth of a second before a piece grows too long. */
export function pieceBounds(samples: Float32Array, rate = DICTATION_SAMPLE_RATE): number[] {
  const bounds: number[] = []
  const longest = PIECE_SECONDS * rate
  const frame = Math.round(rate / 10)
  let start = 0
  while (samples.length - start > longest) {
    let best = start + longest
    let quietest = Number.POSITIVE_INFINITY
    for (
      let at = start + longest - PIECE_SEARCH_SECONDS * rate;
      at + frame <= start + longest;
      at += frame
    ) {
      let energy = 0
      for (let index = at; index < at + frame; index++) energy += samples[index]! ** 2
      if (energy < quietest) {
        quietest = energy
        best = at + Math.round(frame / 2)
      }
    }
    bounds.push(best)
    start = best
  }
  bounds.push(samples.length)
  return bounds
}

/** Little-endian 16-bit PCM, base64 encoded. */
export function encodePcm(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]!))
    pcm[index] = sample < 0 ? sample * 32768 : sample * 32767
  }
  const bytes = new Uint8Array(pcm.buffer)
  let text = ""
  for (let index = 0; index < bytes.length; index += 0x8000)
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(text)
}

/** Decodes a recording and resamples it to mono at the rate Whisper listens at. */
async function toSpeechRate(context: AudioContext, blob: Blob): Promise<Float32Array> {
  const decoded = await context.decodeAudioData(await blob.arrayBuffer())
  const length = Math.ceil(decoded.duration * DICTATION_SAMPLE_RATE)
  const offline = new OfflineAudioContext(1, length, DICTATION_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  return (await offline.startRendering()).getChannelData(0)
}

/** Starts recording from the default microphone; throws as `getUserMedia` does. */
export async function startRecording(onLimit: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
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

  let stopping: Promise<readonly string[] | null> | null = null
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
    })
      .then(async (blob) => {
        for (const track of stream.getTracks()) track.stop()
        if (!keep || performance.now() - startedAt < MIN_RECORDING_MS || blob.size === 0)
          return null
        const samples = await toSpeechRate(context, blob)
        let start = 0
        return pieceBounds(samples).map((end) => {
          const piece = encodePcm(samples.subarray(start, end))
          start = end
          return piece
        })
      })
      .finally(() => void context.close())
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
