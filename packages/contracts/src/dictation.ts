import { Schema } from "effect"

/**
 * Voice dictation records on whichever device holds the composer, desktop or a phone through
 * remote access, and the host turns the speech into text with a Whisper model that runs on the
 * host itself. Nothing leaves the computer, and nobody needs an account or a key.
 */

export const DictationModel = Schema.Literals(["fast", "accurate"])
export type DictationModel = typeof DictationModel.Type

export const DICTATION_MODELS: Readonly<
  Record<DictationModel, { readonly id: string; readonly label: string; readonly size: string }>
> = {
  fast: { id: "Xenova/whisper-base", label: "Fast", size: "77 MB" },
  accurate: { id: "Xenova/whisper-small", label: "Accurate", size: "250 MB" },
}

/** The longest recording; devices send it in pieces so each fits a remote frame. */
export const MAX_DICTATION_SECONDS = 10 * 60

/** Recordings reach the host as 16 kHz mono 16-bit PCM, the rate Whisper listens at. */
export const DICTATION_SAMPLE_RATE = 16_000

export interface DictationStatus {
  readonly model: DictationModel
  /** `missing` until the model is first used, which downloads it once. */
  readonly state: "missing" | "downloading" | "ready" | "error"
  /** Download progress from 0 to 1 while `downloading`. */
  readonly progress: number | null
  readonly error: string | null
  /** Models already on this computer. */
  readonly downloaded: readonly DictationModel[]
}

export const TranscribeAudioInput = Schema.Struct({
  /** 16 kHz mono 16-bit little-endian PCM, base64 encoded. */
  pcm: Schema.String,
  /** The speaker's language as an ISO 639-1 code; omitted lets the model detect it. */
  language: Schema.optional(Schema.String),
})
export type TranscribeAudioInput = typeof TranscribeAudioInput.Type
