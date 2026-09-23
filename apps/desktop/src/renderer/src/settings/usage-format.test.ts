import assert from "node:assert/strict"
import { test } from "node:test"
import {
  durationLabel,
  leftLabel,
  mostConstrained,
  paceSummary,
  readUsage,
  resetLabel,
  windowLabel,
} from "./usage-format"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const now = Date.UTC(2026, 8, 23, 12)
// A 5-hour window, 2 hours in, resetting 3 hours from now.
const reset = (now + 3 * HOUR) / 1_000

test("window labels drop the implied 'limit'", () => {
  assert.equal(windowLabel(300, "Primary"), "5-hour")
  assert.equal(windowLabel(10_080, "Primary"), "Weekly")
  assert.equal(windowLabel(null, "Primary"), "Primary")
})

test("durations truncate to their two largest units", () => {
  assert.equal(durationLabel(30_000), "<1m")
  assert.equal(durationLabel(2 * HOUR + 14 * MINUTE + 50_000), "2h 14m")
  assert.equal(durationLabel(28 * HOUR), "1d 4h")
  assert.equal(durationLabel(3 * HOUR), "3h")
})

test("resets within a day count down", () => {
  assert.equal(resetLabel(reset, now), "Resets in 3h")
  assert.equal(resetLabel(now / 1_000 - 1, now), "Reset due")
  assert.equal(resetLabel(null, now), "Reset time unknown")
})

test("usage in step with elapsed time is on track", () => {
  const reading = readUsage(45, reset, 300, now)
  assert.equal(reading.elapsed, 40)
  assert.equal(reading.pace, "ok")
  assert.equal(paceSummary("5-hour", reading, now), "On track")
})

test("usage well ahead of elapsed time runs fast and projects its run-out", () => {
  const reading = readUsage(80, reset, 300, now)
  assert.equal(reading.pace, "fast")
  // 80% in 2 hours runs out 30 minutes later at the same rate.
  assert.equal(reading.runsOutAt, now + 30 * MINUTE)
  assert.equal(paceSummary("5-hour", reading, now), "5-hour runs out in ~30m")
})

test("low and reached outrank pace, and unknown windows skip the pace check", () => {
  assert.equal(readUsage(92, null, null, now).pace, "low")
  assert.equal(readUsage(100, reset, 300, now).pace, "reached")
  const unknown = readUsage(60, null, null, now)
  assert.equal(unknown.pace, "ok")
  assert.equal(unknown.elapsed, null)
})

test("the most constrained allowance is the worst pace, then the most used", () => {
  const rows = [
    { label: "Weekly", reading: readUsage(70, null, null, now) },
    { label: "5-hour", reading: readUsage(80, reset, 300, now) },
    { label: "Opus", reading: readUsage(75, null, null, now) },
  ]
  assert.equal(mostConstrained(rows)?.label, "5-hour")
  assert.equal(mostConstrained(rows.filter((row) => row.label !== "5-hour"))?.label, "Opus")
})

test("remaining figures are whole, rounded down, and never a false zero", () => {
  assert.equal(leftLabel(31.1), "68")
  assert.equal(leftLabel(0), "100")
  assert.equal(leftLabel(99.6), "<1")
  assert.equal(leftLabel(100), "0")
})
