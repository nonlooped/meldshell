import assert from "node:assert/strict"
import { test } from "node:test"
import type { QueryClient } from "@tanstack/react-query"
import { invalidateThread } from "./cache"

test("reconnect invalidates every loaded transcript and current host state", () => {
  const calls: unknown[] = []
  const client = {
    invalidateQueries: (query?: unknown) => {
      calls.push(query)
      return Promise.resolve()
    },
  } as unknown as QueryClient
  invalidateThread(client, "*", true)
  assert.deepEqual(calls, [undefined])
})

test("streaming updates only invalidate the affected transcript", () => {
  const calls: unknown[] = []
  const client = {
    invalidateQueries: (query?: unknown) => {
      calls.push(query)
      return Promise.resolve()
    },
  } as unknown as QueryClient
  invalidateThread(client, "thread", false)
  assert.deepEqual(calls, [{ queryKey: ["transcript", "thread"] }])
})
