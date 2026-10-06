import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readdir, realpath, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { _electron } from "playwright"

/*
 * An MCP server that lets coding agents run and drive their own MeldShell desktop. Each launch gets
 * a temporary profile, database, and Git workspace, so it never touches the user's instance or
 * data. The renderer comes from a Vite dev server and hot-reloads; main-process and preload
 * changes are rebuilt when stale on launch and restart. Agents read the window as an accessibility
 * snapshot and act on its element refs, like Playwright's own MCP server.
 *
 * Every provider reaches it through the repository's agent configuration; see CONTRIBUTING.md.
 */

// Standard output carries the protocol, so libraries that log there write to standard error.
console.log = console.info = console.debug = console.error

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repository = resolve(desktop, "../..")
// electron-vite resolves its default entries and output against the working directory.
process.chdir(desktop)

const MAX_TEXT = 40_000
const MAX_LOG_LINES = 2_000
const ACTION_TIMEOUT_MS = 10_000

/** @type {{ text: string, read: boolean }[]} */
const logs = []
const log = (source, text) => {
  const message = stripVTControlCharacters(String(text))
  // Vite's development renderer needs unsafe-eval, which Electron warns about on every load.
  if (message.includes("Electron Security Warning")) return
  for (const line of message.split(/\r?\n/))
    if (line.trim()) logs.push({ text: `[${source}] ${line}`, read: false })
  logs.splice(0, Math.max(0, logs.length - MAX_LOG_LINES))
}

const truncate = (value, limit = MAX_TEXT) =>
  value.length > limit
    ? `${value.slice(0, limit)}\n… ${value.length - limit} more characters`
    : value

const newest = async (path) => {
  const info = await stat(path).catch(() => null)
  if (info === null) return 0
  if (!info.isDirectory()) return info.mtimeMs
  let time = 0
  for (const entry of await readdir(path, { recursive: true, withFileTypes: true }))
    if (entry.isFile())
      time = Math.max(time, (await stat(join(entry.parentPath, entry.name))).mtimeMs)
  return time
}

/** Rebuilds the main process and preload when any of their sources changed since the last build. */
const buildIfStale = async (vite, config) => {
  const outputs = await Promise.all(
    ["out/main/index.js", "out/preload/index.js"].map((path) =>
      stat(join(desktop, path)).then(
        (info) => info.mtimeMs,
        () => 0,
      ),
    ),
  )
  const packages = (await readdir(join(repository, "packages"))).filter((name) => name !== "ui")
  const sources = [
    join(desktop, "src/main"),
    join(desktop, "src/preload"),
    join(desktop, "electron.vite.config.ts"),
    ...packages.map((name) => join(repository, "packages", name, "src")),
  ]
  const changed = Math.max(...(await Promise.all(sources.map(newest))))
  if (changed <= Math.min(...outputs)) return "The main process and preload are up to date."
  const started = Date.now()
  for (const target of [config.main, config.preload])
    await vite.build({ ...target, logLevel: "warn", customLogger: viteLogger(vite, "build") })
  return `Rebuilt the main process and preload in ${((Date.now() - started) / 1000).toFixed(1)}s.`
}

const viteLogger = (vite, source) => {
  const logger = vite.createLogger("info")
  for (const level of ["info", "warn", "error"]) logger[level] = (message) => log(source, message)
  logger.warnOnce = logger.warn
  return logger
}

/** The renderer dev server, shared by every launch in this session so edits hot-reload. */
let renderer
const startRenderer = async () => {
  if (renderer) return renderer
  const vite = await import("vite")
  const { resolveConfig } = await import("electron-vite")
  const { config } = await resolveConfig({ root: desktop }, "serve", "development")
  const server = await vite.createServer({
    ...config.renderer,
    clearScreen: false,
    customLogger: viteLogger(vite, "renderer"),
  })
  await server.listen()
  renderer = { vite, config, server, url: `http://localhost:${server.httpServer.address().port}` }
  return renderer
}

/** @type {{ app: import("playwright").ElectronApplication, main: import("playwright").Page } | undefined} */
let instance
/** The launch's temporary profile, data, and workspace, kept across restarts. */
let directory

const watched = new WeakSet()
const watch = (page) => {
  if (watched.has(page)) return
  watched.add(page)
  page.setDefaultTimeout(ACTION_TIMEOUT_MS)
  page.on("console", (message) => log(`renderer:${message.type()}`, message.text()))
  page.on("pageerror", (error) => log("renderer:error", error.stack ?? error.message))
}

const launchApp = async () => {
  const { vite, config, url } = await startRenderer()
  const build = await buildIfStale(vite, config)
  const profile = join(directory, "profile")
  await mkdir(profile, { recursive: true })
  const bootstrap = join(directory, "electron-main.cjs")
  await writeFile(
    bootstrap,
    `const { app } = require("electron");\napp.setPath("userData", ${JSON.stringify(profile)});\nrequire(${JSON.stringify(join(desktop, "out/main/index.js"))});\n`,
  )
  const env = {
    ...process.env,
    MELDSHELL_DATA_DIR: join(directory, "data"),
    ELECTRON_RENDERER_URL: url,
  }
  // Inherited from an Electron-based parent, these would turn the app into Node or another app's agent.
  delete env.ELECTRON_RUN_AS_NODE
  delete env.MELDSHELL_BROWSER_MCP
  const app = await _electron.launch({
    args: [
      // An agent's window usually sits behind the user's; throttling it would stall every action.
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-background-timer-throttling",
      bootstrap,
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    ],
    cwd: desktop,
    env,
    timeout: 60_000,
  })
  const output = app.process()
  output.stdout?.on("data", (chunk) => log("main", chunk))
  output.stderr?.on("data", (chunk) => log("main", chunk))
  app.on("window", watch)
  app.on("close", () => {
    log("main", "The app exited.")
    if (instance?.app === app) instance = undefined
  })
  const main = await app.firstWindow()
  watch(main)
  await main.waitForFunction(() => typeof window.meldshell?.getSnapshot === "function", null, {
    timeout: 60_000,
  })
  return { app, main, build }
}

const seedWorkspace = async () => {
  const workspace = join(directory, "workspace")
  await mkdir(workspace)
  await writeFile(join(workspace, "README.md"), "# Agent workspace\n")
  const git = (...args) => execFileSync("git", ["-C", workspace, ...args], { stdio: "ignore" })
  git("init")
  git("add", ".")
  git(
    "-c",
    "user.name=Agent",
    "-c",
    "user.email=agent@example.invalid",
    "commit",
    "-m",
    "Initial workspace",
  )
  // Windows TEMP can use an 8.3 alias; the host stores the canonical folder path.
  return realpath(workspace)
}

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === "EPERM"
  }
}

/** Removes launches whose server was killed before it could clean up, keeping live sessions'. */
const removeAbandoned = async () => {
  for (const name of await readdir(tmpdir())) {
    const pid = Number(/^meldshell-agent-(\d+)-/.exec(name)?.[1])
    if (pid && pid !== process.pid && !alive(pid))
      await rm(join(tmpdir(), name), { recursive: true, force: true }).catch(() => undefined)
  }
}

const stopApp = async () => {
  const current = instance
  instance = undefined
  await current?.app.close().catch(() => undefined)
}

const cleanUp = async () => {
  await stopApp()
  const closing = renderer?.server.close().catch(() => undefined)
  renderer = undefined
  // A dependency scan in progress can hold the dev server open.
  await Promise.race([closing, new Promise((done) => setTimeout(done, 3_000))])
  if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  directory = undefined
}

const running = () => {
  if (!instance) throw new Error("MeldShell is not running. Call launch first.")
  return instance
}

const windows = () => {
  const { app, main } = running()
  return [main, ...app.windows().filter((page) => page !== main)]
}

const pageFor = (args) => {
  const index = args.window ?? 0
  const page = windows()[index]
  if (!page) throw new Error(`There is no window ${index}. Take a snapshot to list the windows.`)
  return page
}

const windowList = async () => {
  const lines = await Promise.all(
    windows().map(async (page, index) => {
      const title = await page.title().catch(() => "")
      return `- window ${index}${index === 0 ? " (main)" : ""}: ${title || "(untitled)"} ${page.url()}`
    }),
  )
  return `Windows:\n${lines.join("\n")}`
}

/** Snapshots track the last one taken, so actions can report only what they changed. */
const snapshot = async (page, incremental = false) => {
  const result = await page._snapshotForAI({ timeout: ACTION_TIMEOUT_MS, track: "agent" })
  if (incremental)
    return result.incremental?.trim()
      ? `Changes since the last snapshot:\n${truncate(result.incremental)}`
      : "The window did not change."
  return truncate(result.full)
}

const locate = (page, args) => {
  if (typeof args.ref === "string" && args.ref) return page.locator(`aria-ref=${args.ref}`)
  if (typeof args.selector === "string" && args.selector) return page.locator(args.selector).first()
  throw new Error("Pass the element's ref from a snapshot, or a Playwright selector.")
}

/** Lets the renderer respond to an action before describing the result. */
const settle = (page) => page.waitForTimeout(200).catch(() => undefined)

const afterAction = async (page, done) => {
  await settle(page)
  return text(`${done}\n\n${await snapshot(page, true)}`)
}

const serialize = (value) => {
  if (value === undefined) return "undefined"
  try {
    return truncate(JSON.stringify(value, null, 2) ?? String(value))
  } catch {
    return truncate(String(value))
  }
}

const text = (value) => ({ content: [{ type: "text", text: value }] })

const target = {
  ref: { type: "string", description: "The element's ref from the latest snapshot, such as e12." },
  selector: {
    type: "string",
    description:
      'A Playwright selector, used when no ref is given, such as role=button[name="Save"].',
  },
  window: {
    type: "integer",
    minimum: 0,
    description: "The window index; defaults to 0, the main window.",
  },
}

const tools = [
  {
    name: "launch",
    description:
      "Starts an isolated MeldShell desktop with a fresh profile, database, and Git workspace, rebuilding the main process and preload first when their sources changed. The renderer hot-reloads on save. Relaunching replaces the running instance with a fresh one.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          description:
            "An absolute folder to add as the workspace instead of a new temporary Git repository.",
        },
        onboarding: {
          type: "boolean",
          description: "Keep the first-run guide instead of skipping it. Defaults to false.",
        },
      },
    },
    run: async (args) => {
      await stopApp()
      if (directory) await rm(directory, { recursive: true, force: true })
      await removeAbandoned()
      directory = await mkdtemp(join(tmpdir(), `meldshell-agent-${process.pid}-`))
      const workspace = args.workspace ? resolve(args.workspace) : await seedWorkspace()
      const { app, main, build } = await launchApp()
      instance = { app, main }
      if (!args.onboarding) {
        const guide = main.getByRole("main", { name: "Set up MeldShell", exact: true })
        // The launch screen can wait on harness probes before the guide appears.
        await guide
          .getByRole("button", { name: "Skip setup", exact: true })
          .click({ timeout: 60_000 })
        await guide.waitFor({ state: "detached" })
      }
      await main.evaluate((path) => window.meldshell.addWorkspacePath(path), workspace)
      await settle(main)
      return text(
        `${build}\nMeldShell is running with workspace ${workspace}.\nProfile and data: ${directory}\nRenderer: ${renderer.url}\n\n${await windowList()}\n\n${await snapshot(main)}`,
      )
    },
  },
  {
    name: "restart",
    description:
      "Restarts the running app with the same profile, data, and workspace, rebuilding the main process and preload first when their sources changed. Use it after main-process or preload edits, or to check that state persists.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      running()
      await stopApp()
      const { app, main, build } = await launchApp()
      instance = { app, main }
      await settle(main)
      return text(`${build}\nRestarted.\n\n${await windowList()}\n\n${await snapshot(main)}`)
    },
  },
  {
    name: "stop",
    description: "Closes the app and deletes its temporary profile, data, and workspace.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      await cleanUp()
      return text("Stopped.")
    },
  },
  {
    name: "snapshot",
    description:
      "Lists the open windows and returns a window's accessibility snapshot. Act on elements by the ref shown beside them.",
    inputSchema: { type: "object", properties: { window: target.window } },
    run: async (args) => text(`${await windowList()}\n\n${await snapshot(pageFor(args))}`),
  },
  {
    name: "click",
    description: "Clicks an element, then reports what changed in the window.",
    inputSchema: {
      type: "object",
      properties: {
        ...target,
        button: { type: "string", enum: ["left", "right", "middle"] },
        double: { type: "boolean" },
        modifiers: {
          type: "array",
          items: { type: "string", enum: ["Alt", "Control", "ControlOrMeta", "Meta", "Shift"] },
        },
      },
    },
    run: async (args) => {
      const page = pageFor(args)
      const element = locate(page, args)
      const options = { button: args.button, modifiers: args.modifiers }
      await (args.double ? element.dblclick(options) : element.click(options))
      return afterAction(page, "Clicked.")
    },
  },
  {
    name: "hover",
    description: "Moves the pointer over an element, such as to reveal a tooltip or hover actions.",
    inputSchema: { type: "object", properties: target },
    run: async (args) => {
      const page = pageFor(args)
      await locate(page, args).hover()
      return afterAction(page, "Hovered.")
    },
  },
  {
    name: "type",
    description:
      "Replaces an editable element's text, or types it key by key with slowly, then reports what changed.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        ...target,
        text: { type: "string" },
        slowly: {
          type: "boolean",
          description: "Type one key at a time after the existing text, firing every key handler.",
        },
        submit: { type: "boolean", description: "Press Enter afterwards." },
      },
    },
    run: async (args) => {
      const page = pageFor(args)
      const element = locate(page, args)
      if (args.slowly) await element.pressSequentially(args.text)
      else await element.fill(args.text)
      if (args.submit) await element.press("Enter")
      return afterAction(page, "Typed.")
    },
  },
  {
    name: "press",
    description:
      "Presses a key or shortcut in the focused element, such as Escape, Enter, or Control+K, then reports what changed.",
    inputSchema: {
      type: "object",
      required: ["key"],
      properties: { key: { type: "string" }, window: target.window },
    },
    run: async (args) => {
      const page = pageFor(args)
      await page.keyboard.press(args.key)
      return afterAction(page, `Pressed ${args.key}.`)
    },
  },
  {
    name: "wait_for",
    description: "Waits until text appears or disappears, or for a number of seconds.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to wait for." },
        textGone: { type: "string", description: "Text to wait to disappear." },
        seconds: { type: "number", minimum: 0, maximum: 60 },
        window: target.window,
      },
    },
    run: async (args) => {
      const page = pageFor(args)
      const timeout = 30_000
      if (args.text) await page.getByText(args.text).first().waitFor({ state: "visible", timeout })
      if (args.textGone)
        await page.getByText(args.textGone).first().waitFor({ state: "hidden", timeout })
      if (args.seconds) await page.waitForTimeout(args.seconds * 1000)
      return afterAction(page, "Done waiting.")
    },
  },
  {
    name: "screenshot",
    description: "Captures a window, or one element in it, as a PNG image.",
    inputSchema: { type: "object", properties: target },
    run: async (args) => {
      const page = pageFor(args)
      const image =
        args.ref || args.selector
          ? await locate(page, args).screenshot()
          : await page.screenshot({ scale: "css" })
      return { content: [{ type: "image", data: image.toString("base64"), mimeType: "image/png" }] }
    },
  },
  {
    name: "evaluate",
    description:
      "Evaluates a JavaScript expression and returns its JSON value; promises are awaited. In the renderer, window.meldshell is the desktop bridge (for example window.meldshell.getSnapshot()), which can set up state faster than clicking. In the main process, the expression can use the electron module as `electron`.",
    inputSchema: {
      type: "object",
      required: ["expression"],
      properties: {
        expression: { type: "string" },
        target: {
          type: "string",
          enum: ["renderer", "main"],
          description: "Defaults to renderer.",
        },
        window: target.window,
      },
    },
    run: async (args) => {
      if (args.target === "main") {
        const value = await running().app.evaluate(
          (electron, source) =>
            new Function("electron", `return (async () => (${source}\n))()`)(electron),
          args.expression,
        )
        return text(serialize(value))
      }
      // Evaluated through the debugger, which the renderer's content security policy allows.
      return text(serialize(await pageFor(args).evaluate(args.expression)))
    },
  },
  {
    name: "logs",
    description:
      "Returns main-process output, renderer console messages and errors, and Vite build messages logged since the last call.",
    inputSchema: {
      type: "object",
      properties: { all: { type: "boolean", description: "Include lines already returned." } },
    },
    run: async (args) => {
      const lines = logs.filter((line) => args.all || !line.read)
      for (const line of lines) line.read = true
      return text(
        lines.length ? truncate(lines.map((line) => line.text).join("\n")) : "No new logs.",
      )
    },
  },
]

const server = new Server(
  { name: "meldshell-dev", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "These tools run an isolated MeldShell desktop built from this checkout so you can see your changes working. Call launch, read the window with snapshot, and act on the refs it lists. Renderer edits hot-reload; call restart after main-process or preload edits. Call stop when finished.",
  },
)

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((candidate) => candidate.name === request.params.name)
  if (!tool)
    return {
      content: [{ type: "text", text: `Unknown tool ${request.params.name}.` }],
      isError: true,
    }
  try {
    return await tool.run(request.params.arguments ?? {})
  } catch (error) {
    return {
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    }
  }
})

const exit = () => void cleanUp().finally(() => process.exit(0))
process.stdin.on("close", exit)
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, exit)

await server.connect(new StdioServerTransport())
