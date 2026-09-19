import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"
import { invalidateThread, queryKeys } from "../apps/desktop/src/renderer/src/data/cache.ts"

test("streaming invalidates only the affected transcript; lifecycle changes refresh lists", () => {
  const client = new QueryClient()
  const keys = [
    queryKeys.snapshot,
    queryKeys.threads,
    queryKeys.transcript("a"),
    queryKeys.transcript("b"),
  ]
  for (const key of keys) client.setQueryData(key, {})
  for (let index = 0; index < 100; index++) invalidateThread(client, "a", false)
  assert.equal(client.getQueryState(queryKeys.snapshot)?.isInvalidated, false)
  assert.equal(client.getQueryState(queryKeys.threads)?.isInvalidated, false)
  assert.equal(client.getQueryState(queryKeys.transcript("a"))?.isInvalidated, true)
  assert.equal(client.getQueryState(queryKeys.transcript("b"))?.isInvalidated, false)
  invalidateThread(client, "a")
  assert.equal(client.getQueryState(queryKeys.snapshot)?.isInvalidated, true)
  assert.equal(client.getQueryState(queryKeys.threads)?.isInvalidated, true)
  client.clear()
})
