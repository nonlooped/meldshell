import assert from "node:assert/strict"
import { test } from "node:test"
import { describeCadence, describeMoment, localInputValue } from "./schedule-format"

test("intervals and day sets read naturally", () => {
  assert.equal(describeCadence({ kind: "interval", minutes: 30 }), "Every 30 minutes")
  assert.equal(describeCadence({ kind: "interval", minutes: 60 }), "Every hour")
  assert.equal(describeCadence({ kind: "interval", minutes: 180 }), "Every 3 hours")
  assert.match(describeCadence({ kind: "daily", time: "09:30", weekdays: [] }), /^Every day at /)
  assert.match(
    describeCadence({ kind: "daily", time: "09:30", weekdays: [5, 1, 2, 3, 4] }),
    /^Weekdays at /,
  )
  assert.match(describeCadence({ kind: "daily", time: "09:30", weekdays: [3, 1] }), /^Mon, Wed at /)
})

test("moments are described relative to now", () => {
  const now = new Date(2026, 8, 24, 10, 0)
  assert.equal(describeMoment(new Date(2026, 8, 24, 10, 20), now), "in 20 minutes")
  assert.match(describeMoment(new Date(2026, 8, 24, 15, 0), now), /^today at /)
  assert.match(describeMoment(new Date(2026, 8, 25, 9, 0), now), /^tomorrow at /)
  assert.equal(localInputValue(new Date(2026, 8, 4, 7, 5)), "2026-09-04T07:05")
})
