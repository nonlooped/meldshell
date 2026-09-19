import { UsageLimit, type CodexUsage } from "@meldshell/contracts"
import { Schema } from "effect"

const UsageResponse = Schema.Struct({
  rateLimits: UsageLimit,
  rateLimitsByLimitId: Schema.optional(
    Schema.NullOr(
      Schema.Record({
        key: Schema.String,
        value: UsageLimit,
      }),
    ),
  ),
  rateLimitResetCredits: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        availableCount: Schema.Number.pipe(Schema.finite()),
      }),
    ),
  ),
})

function parseCodexUsage(response: unknown): CodexUsage {
  const result = Schema.decodeUnknownSync(UsageResponse)(response)
  const limits = new Map(Object.entries(result.rateLimitsByLimitId ?? {}))
  const legacyId = result.rateLimits.limitId ?? "codex"
  if (!limits.has(legacyId)) limits.set(legacyId, result.rateLimits)
  return {
    checkedAt: new Date().toISOString(),
    limits: [...limits].map(([id, limit]) => ({ id, limit })),
    resetCredits: result.rateLimitResetCredits?.availableCount ?? null,
  }
}

export async function readCodexUsage(
  server: {
    request(
      method: string,
      params: unknown,
      options?: { signal?: AbortSignal; timeoutMs?: number },
    ): Promise<unknown>
  },
  signal?: AbortSignal,
): Promise<CodexUsage> {
  return parseCodexUsage(
    await server.request(
      "account/rateLimits/read",
      {},
      { ...(signal === undefined ? {} : { signal }), timeoutMs: 15_000 },
    ),
  )
}
