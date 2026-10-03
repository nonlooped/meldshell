import { Schema } from "effect"

/**
 * Voice dictation records on whichever device holds the composer, desktop or a phone through
 * remote access, and the host turns the recording into text with an OpenAI-compatible
 * transcription service. The API key stays on the host; clients only learn where it comes from.
 */

export const DEFAULT_DICTATION_ENDPOINT = "https://api.openai.com/v1"
export const DEFAULT_DICTATION_MODEL = "gpt-4o-mini-transcribe"

/** OpenAI accepts uploads up to 25 MB; remote frames carry far less, so recordings stay short. */
export const MAX_DICTATION_SECONDS = 10 * 60

/** Where the host found the key it transcribes with, in the order it looks. */
export const DictationKeySource = Schema.Literals(["settings", "environment", "codex"])
export type DictationKeySource = typeof DictationKeySource.Type

export interface DictationStatus {
  /** Whether a key is available, so the microphone can be offered. */
  readonly ready: boolean
  readonly source: DictationKeySource | null
  /** The key's last characters, for recognising it; never the key itself. */
  readonly keyHint: string | null
  readonly endpoint: string
  readonly model: string
}

export const SetDictationSettingsInput = Schema.Struct({
  /** A new key; an empty string removes the stored one. Omitted keeps it. */
  apiKey: Schema.optional(Schema.String),
  /** An OpenAI-compatible base URL, such as a local Whisper server; empty restores OpenAI. */
  endpoint: Schema.optional(Schema.String),
  /** Empty restores the default model. */
  model: Schema.optional(Schema.String),
})
export type SetDictationSettingsInput = typeof SetDictationSettingsInput.Type

export const TranscribeAudioInput = Schema.Struct({
  /** The recording, base64 encoded without a data URL prefix. */
  audio: Schema.String,
  /** The recorder's MIME type, such as `audio/webm;codecs=opus` or `audio/mp4`. */
  mimeType: Schema.String,
  /** Text just before the caret, so the transcript continues it in the same style and terms. */
  prompt: Schema.optional(Schema.String),
})
export type TranscribeAudioInput = typeof TranscribeAudioInput.Type
