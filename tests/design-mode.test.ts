import assert from "node:assert/strict"
import test from "node:test"
import type { PickedElement } from "../packages/contracts/src/ipc.ts"
import {
  elementAttachment,
  elementContext,
  messageWithContext,
} from "../packages/ui/src/preview/design-mode.ts"

const element = (patch: Partial<PickedElement> = {}): PickedElement => ({
  url: "http://localhost:3000/pricing",
  label: "button.cta",
  selector: "main > section:nth-of-type(2) > button.cta",
  width: 180,
  height: 44,
  html: '<button class="cta">Start free</button>',
  text: "Start free",
  styles: [
    ["display", "inline-flex"],
    ["border-radius", "8px"],
  ],
  screenshot: "data:image/png;base64,AAAA",
  more: false,
  ...patch,
})

test("a picked element is described with its selector, HTML and styles", () => {
  assert.equal(
    elementContext(element()),
    [
      "Selected element `button.cta` on http://localhost:3000/pricing (screenshot attached):\n" +
        "- Selector: `main > section:nth-of-type(2) > button.cta`\n" +
        "- Size: 180×44\n" +
        '- Text: "Start free"',
      '```html\n<button class="cta">Start free</button>\n```',
      "Computed styles:\n```css\ndisplay: inline-flex;\nborder-radius: 8px;\n```",
    ].join("\n\n"),
  )
})

test("HTML holding a code fence gets a longer fence", () => {
  const context = elementContext(element({ html: "<pre>```js\nx\n```</pre>", styles: [] }))
  assert.match(context, /````html\n<pre>```js\nx\n```<\/pre>\n````$/)
})

test("the screenshot becomes an image attachment carrying the element's details", () => {
  const attachment = elementAttachment(element())
  assert.equal(attachment?.type, "image")
  assert.equal(attachment?.name, "<button.cta>")
  assert.equal(attachment?.context, elementContext(element()))
  assert.equal(elementAttachment(element({ screenshot: null })), null)
})

test("element details follow the message, and plain messages are unchanged", () => {
  const attachment = elementAttachment(element())!
  assert.equal(
    messageWithContext("Make this look like the header button.  ", [attachment]),
    `Make this look like the header button.\n\n${attachment.context}`,
  )
  assert.equal(messageWithContext("", [attachment]), attachment.context)
  assert.equal(messageWithContext("Hello ", [{ type: "image", value: "x" }]), "Hello ")
})
