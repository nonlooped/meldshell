import type { WebContents } from "electron"

/*
 * The browser tools agents call through MCP. Each runs against the page a thread's preview shows
 * and reports, in a few words, what it is doing so the preview can show the user. Page scripts are
 * plain strings: bundling would rename helpers inside functions serialized with `toString`.
 */

interface ToolContent {
  readonly type: "text" | "image"
  readonly text?: string
  readonly data?: string
  readonly mimeType?: string
}

export interface ToolResult {
  readonly content: readonly ToolContent[]
  readonly isError?: boolean
}

/** Where a click or the element being typed into sits, in page pixels. */
interface Point {
  readonly x: number
  readonly y: number
}

export interface BrowserActivity {
  readonly label: string
  readonly point?: Point
}

/** What a tool needs from the thread's browser. */
export interface ToolPage {
  /** The page the thread's preview shows; throws when none is open. */
  readonly page: () => Promise<WebContents>
  /** Loads an address, opening the preview first; the error is null once the page loaded. */
  readonly open: (url: string) => Promise<{ page: WebContents; error: string | null }>
  readonly report: (activity: BrowserActivity) => void
}

type Args = Readonly<Record<string, unknown>>

interface Tool {
  readonly definition: {
    readonly name: string
    readonly title: string
    readonly description: string
    readonly inputSchema: object
    readonly annotations?: object
  }
  readonly run: (args: Args, browser: ToolPage) => Promise<ToolResult>
}

const LOAD_TIMEOUT_MS = 20_000
const MAX_WAIT_MS = 30_000
const MAX_TEXT = 6_000
const MAX_RESULT = 20_000
const SCREENSHOT_WIDTH = 1280

const text = (value: string): ToolResult => ({ content: [{ type: "text", text: value }] })
const failure = (value: string): ToolResult => ({
  content: [{ type: "text", text: value }],
  isError: true,
})
const string = (value: unknown): string => (typeof value === "string" ? value : "")
const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined
const quoted = (value: string, limit = 40): string =>
  `“${value.length > limit ? `${value.slice(0, limit - 1)}…` : value}”`

/**
 * The address an agent asked for. Bare local hosts such as `localhost:3000` get `http://`, like the
 * preview's own address bar; other bare hosts get `https://`.
 */
const agentAddress = (input: string): string | null => {
  const trimmed = input.trim()
  if (!trimmed) return null
  const local = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[a-z0-9-]+\.localhost)(?:[:/]|$)/i
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${local.test(trimmed) ? "http" : "https"}://${trimmed}`
  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

const hostLabel = (url: string): string => {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`
  } catch {
    return url
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Resolves once the page stops loading, or after the deadline; a slow page is still usable. */
export const settle = (page: WebContents, timeout = LOAD_TIMEOUT_MS): Promise<void> =>
  new Promise((resolve) => {
    if (!page.isLoading()) {
      resolve()
      return
    }
    const done = () => {
      clearTimeout(timer)
      page.off("did-stop-loading", done)
      page.off("destroyed", done)
      resolve()
    }
    const timer = setTimeout(done, timeout)
    page.once("did-stop-loading", done)
    page.once("destroyed", done)
  })

const summary = (page: WebContents): string =>
  `Page: ${page.getTitle() || "(untitled)"}\nURL: ${page.getURL()}`

/** Runs a page script, turning page exceptions into tool errors with the page's message. */
const evaluate = async <Value>(page: WebContents, script: string): Promise<Value> =>
  (await page.executeJavaScript(script, true)) as Value

/*
 * Labels the visible interactive elements with `data-meldshell-ref` so later tools can name them,
 * and returns them with the page's readable text.
 */
const SNAPSHOT_SCRIPT = `(() => {
  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim()
  const visible = (element) => {
    const box = element.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return false
    const style = getComputedStyle(element)
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0"
  }
  for (const old of document.querySelectorAll("[data-meldshell-ref]")) old.removeAttribute("data-meldshell-ref")
  const selector = 'a[href], button, input:not([type="hidden"]), textarea, select, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [role="textbox"], [role="combobox"], [contenteditable=""], [contenteditable="true"]'
  const elements = []
  let ref = 0
  for (const element of document.querySelectorAll(selector)) {
    if (elements.length >= 150) break
    if (!visible(element)) continue
    ref += 1
    element.setAttribute("data-meldshell-ref", String(ref))
    const tag = element.tagName.toLowerCase()
    const type = (element.getAttribute("type") || "").toLowerCase()
    const role = element.getAttribute("role") ||
      (tag === "a" ? "link" : tag === "select" ? "select" : tag === "textarea" ? "textbox" :
        tag === "input" ? (["checkbox", "radio", "submit", "button", "reset", "range", "file"].includes(type) ? type : "textbox") :
        element.isContentEditable ? "textbox" : tag)
    const labels = element.labels ? [...element.labels].map((label) => label.innerText).join(" ") : ""
    const name = clean(element.getAttribute("aria-label") || labels || (tag === "input" || tag === "textarea" ? "" : element.innerText) ||
      element.getAttribute("title") || element.getAttribute("alt") || element.getAttribute("name")).slice(0, 80)
    const details = []
    if ((tag === "input" || tag === "textarea") && element.placeholder) details.push("placeholder=" + JSON.stringify(element.placeholder.slice(0, 60)))
    if ((tag === "input" || tag === "textarea" || tag === "select") && element.value && type !== "password") details.push("value=" + JSON.stringify(String(element.value).slice(0, 60)))
    if (element.checked) details.push("checked")
    if (element.disabled) details.push("disabled")
    if (tag === "a") details.push("href=" + JSON.stringify(element.getAttribute("href").slice(0, 100)))
    elements.push("[" + ref + "] " + role + (name ? " " + JSON.stringify(name) : "") + (details.length ? " " + details.join(" ") : ""))
  }
  const body = document.body ? document.body.innerText : ""
  return {
    elements,
    text: body.replace(/\\n{3,}/g, "\\n\\n").trim(),
    scrollY: Math.round(scrollY),
    scrollHeight: document.documentElement.scrollHeight,
    viewport: innerWidth + "x" + innerHeight,
  }
})()`

interface Snapshot {
  readonly elements: readonly string[]
  readonly text: string
  readonly scrollY: number
  readonly scrollHeight: number
  readonly viewport: string
}

/** A script that finds the target element, scrolls it into view, and returns where it is. */
const targetScript = (args: Args, focus: boolean): string => `(() => {
  const ref = ${JSON.stringify(string(args.ref))}
  const selector = ${JSON.stringify(string(args.selector))}
  const wanted = ${JSON.stringify(string(args.text).trim().toLowerCase())}
  let element = null
  if (ref) element = document.querySelector('[data-meldshell-ref="' + CSS.escape(ref) + '"]')
  else if (selector) element = document.querySelector(selector)
  else if (wanted) {
    const candidates = document.querySelectorAll('a, button, input, textarea, select, summary, label, [role], [onclick], [contenteditable], [tabindex]')
    const name = (node) => String(node.getAttribute("aria-label") || node.innerText || node.value || node.placeholder || "").replace(/\\s+/g, " ").trim().toLowerCase()
    const shown = [...candidates].filter((node) => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 })
    element = shown.find((node) => name(node) === wanted) || shown.find((node) => name(node).includes(wanted)) || null
  }
  if (!element) return null
  element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })
  if (${focus}) element.focus()
  const box = element.getBoundingClientRect()
  const label = String(element.getAttribute("aria-label") || element.innerText || element.value || element.placeholder || element.getAttribute("name") || element.tagName.toLowerCase()).replace(/\\s+/g, " ").trim().slice(0, 60)
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2), label }
})()`

interface Target {
  readonly x: number
  readonly y: number
  readonly label: string
}

const targetSchema = {
  ref: {
    type: "string",
    description: "An element number from the latest browser_snapshot, such as 12.",
  },
  selector: { type: "string", description: "A CSS selector, used when no ref is given." },
  text: {
    type: "string",
    description:
      "Visible text or label of the element, used when neither ref nor selector is given.",
  },
} as const

const describeTarget = (args: Args): string =>
  string(args.ref)
    ? `element ${string(args.ref)}`
    : string(args.selector) || quoted(string(args.text))

const findTarget = async (page: WebContents, args: Args, focus: boolean): Promise<Target> => {
  if (!string(args.ref) && !string(args.selector) && !string(args.text).trim())
    throw new Error("Name the element with ref, selector, or text.")
  const target = await evaluate<Target | null>(page, targetScript(args, focus))
  if (target === null)
    throw new Error(
      `No element matches ${describeTarget(args)}. Take a new browser_snapshot; refs change when the page does.`,
    )
  return target
}

const KEY_CODES: Readonly<Record<string, string>> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
}

const MODIFIERS = new Set(["Shift", "Control", "Ctrl", "Alt", "Meta", "Command", "Cmd"])

/** Sends a key such as `Enter`, `Tab`, or `Control+A` as real keyboard input. */
const pressKey = (page: WebContents, chord: string): void => {
  const parts = chord.split("+").map((part) => part.trim())
  const key = parts.pop() ?? ""
  const modifiers = parts
    .filter((part) => MODIFIERS.has(part))
    .map((part) =>
      part === "Ctrl"
        ? "control"
        : part === "Cmd" || part === "Command"
          ? "meta"
          : part.toLowerCase(),
    ) as Electron.InputEvent["modifiers"]
  const keyCode = KEY_CODES[key] ?? key
  page.sendInputEvent({ type: "keyDown", keyCode, modifiers })
  // Chromium types characters, submits forms, and inserts line breaks from the char event.
  if (key === "Enter") page.sendInputEvent({ type: "char", keyCode: "\r", modifiers })
  else if (key.length === 1 && (modifiers ?? []).every((modifier) => modifier === "shift"))
    page.sendInputEvent({ type: "char", keyCode: key, modifiers })
  page.sendInputEvent({ type: "keyUp", keyCode, modifiers })
}

const click = (page: WebContents, point: Point, button: "left" | "right", count: number): void => {
  page.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y })
  for (let clickCount = 1; clickCount <= count; clickCount++) {
    page.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button, clickCount })
    page.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button, clickCount })
  }
}

/** Gives a click's navigation or re-render a moment to begin, then waits for it to finish. */
const afterInput = async (page: WebContents): Promise<void> => {
  await sleep(150)
  await settle(page, 10_000)
}

const resultText = (value: unknown): string => {
  if (value === undefined) return "undefined"
  const rendered = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return rendered.length > MAX_RESULT ? `${rendered.slice(0, MAX_RESULT)}\n… (truncated)` : rendered
}

const tools: readonly Tool[] = [
  {
    definition: {
      name: "browser_open",
      title: "Open a page",
      description:
        "Open a web address in this thread's MeldShell browser preview, which the user watches. " +
        "Use it for local dev servers (such as localhost:3000) and public sites. Waits for the page to load.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "An http or https address, or a host such as localhost:5173.",
          },
        },
        required: ["url"],
      },
    },
    run: async (args, browser) => {
      const url = agentAddress(string(args.url))
      if (url === null) return failure("Give an http or https address.")
      browser.report({ label: `Opening ${hostLabel(url)}` })
      // A failed load still leaves the error page to inspect, so the summary follows the error.
      const { page, error } = await browser.open(url)
      if (error !== null) return failure(`The page could not be loaded: ${error}\n${summary(page)}`)
      return text(
        `${summary(page)}\nUse browser_snapshot to read it or browser_screenshot to see it.`,
      )
    },
  },
  {
    definition: {
      name: "browser_navigate",
      title: "Go back, forward, or reload",
      description: "Go back or forward in the preview's history, or reload the page.",
      inputSchema: {
        type: "object",
        properties: { action: { type: "string", enum: ["back", "forward", "reload"] } },
        required: ["action"],
      },
    },
    run: async (args, browser) => {
      const page = await browser.page()
      const history = page.navigationHistory
      const action = string(args.action)
      if (action === "back") {
        if (!history.canGoBack()) return failure("There is no earlier page.")
        browser.report({ label: "Going back" })
        history.goBack()
      } else if (action === "forward") {
        if (!history.canGoForward()) return failure("There is no later page.")
        browser.report({ label: "Going forward" })
        history.goForward()
      } else if (action === "reload") {
        browser.report({ label: "Reloading" })
        page.reload()
      } else return failure("Choose back, forward, or reload.")
      await afterInput(page)
      return text(summary(page))
    },
  },
  {
    definition: {
      name: "browser_snapshot",
      title: "Read the page",
      description:
        "Read the page as text: its title, address, visible text, and numbered interactive " +
        "elements (links, buttons, fields). Pass an element's number as `ref` to browser_click or " +
        "browser_type. Prefer this to screenshots for finding and reading things.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    },
    run: async (_args, browser) => {
      const page = await browser.page()
      browser.report({ label: "Reading the page" })
      const snapshot = await evaluate<Snapshot>(page, SNAPSHOT_SCRIPT)
      const body =
        snapshot.text.length > MAX_TEXT
          ? `${snapshot.text.slice(0, MAX_TEXT)}\n… (${snapshot.text.length - MAX_TEXT} more characters; scroll or use browser_evaluate to read further)`
          : snapshot.text
      return text(
        [
          summary(page),
          `Viewport ${snapshot.viewport}, scrolled to ${snapshot.scrollY} of ${snapshot.scrollHeight}px`,
          "",
          "Interactive elements:",
          snapshot.elements.length ? snapshot.elements.join("\n") : "(none visible)",
          "",
          "Text:",
          body || "(no text)",
        ].join("\n"),
      )
    },
  },
  {
    definition: {
      name: "browser_screenshot",
      title: "Take a screenshot",
      description:
        "Capture what the preview shows right now as an image, to check layout, styling, or anything visual.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    },
    run: async (_args, browser) => {
      const page = await browser.page()
      browser.report({ label: "Taking a screenshot" })
      await settle(page, 5_000)
      let image = await page.capturePage()
      if (image.isEmpty()) return failure("The preview has nothing to capture yet.")
      if (image.getSize().width > SCREENSHOT_WIDTH)
        image = image.resize({ width: SCREENSHOT_WIDTH, quality: "good" })
      const { width, height } = image.getSize()
      return {
        content: [
          {
            type: "image",
            data: image.toJPEG(80).toString("base64"),
            mimeType: "image/jpeg",
          },
          { type: "text", text: `${summary(page)}\nScreenshot ${width}x${height}` },
        ],
      }
    },
  },
  {
    definition: {
      name: "browser_click",
      title: "Click an element",
      description:
        "Click an element, named by its ref from browser_snapshot, a CSS selector, or its visible text. " +
        "Coordinates (x, y in page pixels) click a point instead.",
      inputSchema: {
        type: "object",
        properties: {
          ...targetSchema,
          x: { type: "number" },
          y: { type: "number" },
          button: { type: "string", enum: ["left", "right"] },
          double: { type: "boolean", description: "Double-click." },
        },
      },
    },
    run: async (args, browser) => {
      const page = await browser.page()
      const x = number(args.x)
      const y = number(args.y)
      const target =
        x !== undefined && y !== undefined
          ? { x, y, label: `${x}, ${y}` }
          : await findTarget(page, args, false)
      browser.report({ label: `Clicking ${quoted(target.label)}`, point: target })
      click(page, target, args.button === "right" ? "right" : "left", args.double === true ? 2 : 1)
      await afterInput(page)
      return text(`Clicked ${quoted(target.label, 80)}.\n${summary(page)}`)
    },
  },
  {
    definition: {
      name: "browser_type",
      title: "Type into a field",
      description:
        "Type text into a field, named like browser_click's targets. Replaces what the field " +
        "holds unless `append` is true, and presses Enter afterwards when `submit` is true.",
      inputSchema: {
        type: "object",
        properties: {
          ...targetSchema,
          value: { type: "string", description: "The text to type." },
          append: { type: "boolean" },
          submit: { type: "boolean" },
        },
        required: ["value"],
      },
    },
    run: async (args, browser) => {
      const page = await browser.page()
      const target = await findTarget(page, args, true)
      browser.report({ label: `Typing into ${quoted(target.label)}`, point: target })
      if (args.append !== true)
        await evaluate(
          page,
          `(() => { const element = document.activeElement; if (!element) return
            if (typeof element.select === "function") element.select()
            else if (element.isContentEditable) document.getSelection().selectAllChildren(element) })()`,
        )
      await page.insertText(string(args.value))
      if (args.submit === true) {
        pressKey(page, "Enter")
        await afterInput(page)
      }
      return text(
        `Typed into ${quoted(target.label, 80)}${args.submit === true ? " and pressed Enter" : ""}.\n${summary(page)}`,
      )
    },
  },
  {
    definition: {
      name: "browser_press_key",
      title: "Press a key",
      description:
        "Press a key in the page, such as Enter, Tab, Escape, ArrowDown, or a chord like Control+A.",
      inputSchema: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
      },
    },
    run: async (args, browser) => {
      const key = string(args.key).trim()
      if (!key) return failure("Name a key to press.")
      const page = await browser.page()
      browser.report({ label: `Pressing ${key}` })
      pressKey(page, key)
      await afterInput(page)
      return text(`Pressed ${key}.\n${summary(page)}`)
    },
  },
  {
    definition: {
      name: "browser_scroll",
      title: "Scroll the page",
      description:
        "Scroll the page up or down by a number of pixels (default: most of a screen), or to the top or bottom.",
      inputSchema: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["up", "down", "top", "bottom"] },
          pixels: { type: "number" },
        },
        required: ["direction"],
      },
    },
    run: async (args, browser) => {
      const page = await browser.page()
      const direction = string(args.direction)
      const pixels = number(args.pixels)
      browser.report({ label: `Scrolling ${direction}` })
      const position = await evaluate<{ y: number; height: number }>(
        page,
        `(() => {
          const direction = ${JSON.stringify(direction)}
          const step = ${pixels ?? "Math.round(innerHeight * 0.8)"}
          if (direction === "top") scrollTo({ top: 0, behavior: "instant" })
          else if (direction === "bottom") scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })
          else scrollBy({ top: direction === "up" ? -step : step, behavior: "instant" })
          return { y: Math.round(scrollY), height: document.documentElement.scrollHeight }
        })()`,
      )
      return text(`Scrolled to ${position.y} of ${position.height}px.`)
    },
  },
  {
    definition: {
      name: "browser_wait_for",
      title: "Wait for the page",
      description:
        "Wait until text appears on the page, or a CSS selector matches, for up to `timeout_ms` (default 10000, at most 30000).",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          selector: { type: "string" },
          timeout_ms: { type: "number" },
        },
      },
      annotations: { readOnlyHint: true },
    },
    run: async (args, browser) => {
      const page = await browser.page()
      const wanted = string(args.text)
      const selector = string(args.selector)
      if (!wanted && !selector) return failure("Give text or a selector to wait for.")
      browser.report({ label: `Waiting for ${wanted ? quoted(wanted) : selector}` })
      const deadline =
        Date.now() + Math.min(Math.max(number(args.timeout_ms) ?? 10_000, 0), MAX_WAIT_MS)
      const check = `(() => ${
        selector
          ? `document.querySelector(${JSON.stringify(selector)}) !== null`
          : `(document.body ? document.body.innerText : "").includes(${JSON.stringify(wanted)})`
      })()`
      for (;;) {
        if (!page.isLoading() && (await evaluate<boolean>(page, check).catch(() => false)))
          return text(`Found ${wanted ? quoted(wanted, 80) : selector}.\n${summary(page)}`)
        if (Date.now() >= deadline)
          return failure(`Timed out waiting for ${wanted ? quoted(wanted, 80) : selector}.`)
        await sleep(250)
      }
    },
  },
  {
    definition: {
      name: "browser_evaluate",
      title: "Run JavaScript in the page",
      description:
        "Evaluate a JavaScript expression in the page and return its JSON-serializable result. " +
        "Promises are awaited; wrap statements in an async arrow function and call it.",
      inputSchema: {
        type: "object",
        properties: { expression: { type: "string" } },
        required: ["expression"],
      },
    },
    run: async (args, browser) => {
      const expression = string(args.expression)
      if (!expression.trim()) return failure("Give an expression to evaluate.")
      const page = await browser.page()
      browser.report({ label: "Running a script" })
      const value = await evaluate<unknown>(page, expression)
      return text(resultText(value))
    },
  },
]

export const toolDefinitions = tools.map((tool) => tool.definition)

/** Runs a tool call; failures become tool errors the agent can read and recover from. */
export const callTool = async (
  name: string,
  args: Args,
  browser: ToolPage,
): Promise<ToolResult> => {
  const tool = tools.find((candidate) => candidate.definition.name === name)
  if (tool === undefined) return failure(`Unknown tool: ${name}`)
  try {
    return await tool.run(args, browser)
  } catch (cause) {
    return failure(cause instanceof Error ? cause.message : String(cause))
  }
}
