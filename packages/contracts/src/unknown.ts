/*
 * Narrowing for values MeldShell does not control: native provider payloads, stored JSON, and
 * rejection reasons. Each accessor returns a neutral empty value instead of throwing, so projection
 * code can read optional fields without a guard at every step.
 */

export type UnknownRecord = Record<string, unknown>

/** A plain object; arrays and null are not. */
export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The value as an object, or an empty one. */
export const asRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {})

/** Each entry of an array as an object; anything but an array is empty. */
export const asRecords = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.map(asRecord) : []

/** The value when it is a string, otherwise `""`. */
export const asText = (value: unknown): string => (typeof value === "string" ? value : "")

/** The value when it is a non-empty string, otherwise null. */
export const nonEmptyText = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

/**
 * The message a rejection carries: an Error's, or a `message` field on a tagged failure. Anything
 * else reads as `fallback`, or its string form without one.
 */
export const errorMessage = (cause: unknown, fallback?: string): string => {
  if (cause instanceof Error) return cause.message
  if (isRecord(cause) && typeof cause.message === "string") return cause.message
  return fallback ?? String(cause)
}

/** A rejection as an Error, keeping the original when it already is one. */
export const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(errorMessage(cause))
