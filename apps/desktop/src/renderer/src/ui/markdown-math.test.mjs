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

test("math candidates include inline, display, streamed delimiters and math fences", () => {
  for (const text of [
    "$x$",
    "$$\nx^2\n$$",
    "$",
    "```math\nx^2\n```",
    "~~~~math\nx\n~~~~",
    "  ```math title=example\nx\n```",
    "> ```math\n> x\n> ```",
    "- ~~~math\n  x\n  ~~~",
    "``` math\nx\n```",
    "~~~\tmath\nx\n~~~",
  ])
    assert.equal(mayContainMath(text), true, text)
})
