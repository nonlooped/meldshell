import assert from "node:assert/strict"
import { test } from "node:test"
import { mayContainMath } from "./markdown-math.ts"

test("ordinary prose and non-math fences do not request the math bundle", () => {
  for (const text of [
    "",
    "Hello **world**",
    "```js\nconst a = 1\n```",
    "```mermaid\ngraph TD; A-->B\n```",
  ])
    assert.equal(mayContainMath(text), false)
})
