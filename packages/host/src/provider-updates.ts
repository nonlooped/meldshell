import { realpath } from "node:fs/promises"
import { stripVTControlCharacters } from "node:util"
import {
  HARNESSES,
  unknownUpdateStatus,
  type Harness,
  type ProviderUpdateStatus,
} from "@meldshell/contracts"
import { runCommand, type CommandResult } from "@meldshell/provider-runtime/command"
import { Context, Effect, Either, Layer, Runtime, Stream, type Scope } from "effect"
import { attempt } from "./attempt"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import {
  providerFor,
  type ClaudeProvider,
  type CodexProvider,
  type CursorProvider,
} from "./worker-provider"

/*
 * Compares each installed harness with its newest release and runs the harness's own updater on
 * request. Releases are read from the places the vendors' installers read them; a check never
 * changes anything on disk.
 */

const HARNESS_LIST = Object.keys(HARNESSES) as ReadonlyArray<Harness>

/** How long a fetched latest version answers further checks before it is fetched again. */
const LATEST_TTL_MS = 60 * 60_000
/** Every installed harness is compared again this often while the host runs. */
const RECHECK_INTERVAL = "4 hours"
const INSTALL_TIMEOUT_MS = 10 * 60_000

/** The `version` of an npm registry `latest` document. */
export const npmVersion = (text: string): string | null => {
  try {
    const version: unknown = JSON.parse(text).version
    return typeof version === "string" && version !== "" ? version : null
  } catch {
    return null
  }
}

/** The release the Cursor CLI installer script downloads; Cursor publishes no other feed. */
export const cursorInstallerVersion = (text: string): string | null =>
  text.match(/downloads\.cursor\.com\/lab\/([^/"'\s]+)\//)?.[1] ?? null

const LATEST_SOURCES: {
  readonly [Key in Harness]: {
    readonly url: string
    readonly parse: (text: string) => string | null
  }
} = {
  codex: { url: "https://registry.npmjs.org/@openai/codex/latest", parse: npmVersion },
  "claude-code": {
    url: "https://registry.npmjs.org/@anthropic-ai/claude-code/latest",
    parse: npmVersion,
  },
  cursor: { url: "https://cursor.com/install", parse: cursorInstallerVersion },
}

export type VersionOrder = "behind" | "current" | "ahead"

/**
 * Orders two versions by their numeric parts, so `0.9.1 < 0.10.0` and Cursor's dated
 * `2026.09.23-86fc751` builds compare by date. Equal numbers with different text, such as two
 * Cursor builds from one day, read as behind: the published one is the newer build.
 */
export const compareVersions = (installed: string, latest: string): VersionOrder => {
  const numbers = (version: string): number[] =>
    version
      .split(/[.-]/)
      .filter((part) => /^\d+$/.test(part))
      .map(Number)
  const left = numbers(installed)
  const right = numbers(latest)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a < b ? "behind" : "ahead"
  }
  return installed === latest ? "current" : "behind"
}

export interface UpdatePlan {
  readonly file: string
  readonly args: readonly string[]
  /** The command as a person would type it. */
  readonly display: string
  readonly env?: Readonly<Record<string, string>>
}

/** How an install is updated: a command MeldShell can run, or an instruction it cannot. */
export type UpdateResolution = { readonly plan: UpdatePlan } | { readonly manual: string }

const brewUpgrade = (kind: "--cask" | "--formula", name: string): UpdateResolution => ({
  plan: { file: "brew", args: ["upgrade", kind, name], display: `brew upgrade ${kind} ${name}` },
})

const SELF_UPDATE: { readonly [Key in Harness]: string } = {
  codex: "codex update",
  "claude-code": "claude update",
  cursor: "agent update",
}

/**
 * Chooses the updater from where the executable really lives. Homebrew installs are upgraded
 * through Homebrew, since the harnesses' own updaters leave them alone; system packages need the
 * system's package manager and its privileges; everything else has a built-in updater that knows
 * its own install method, such as npm or the vendor's standalone installer.
 */
export const planUpdate = (
  harness: Harness,
  executablePath: string,
  resolvedPath: string,
): UpdateResolution => {
  const segments = resolvedPath.split(/[\\/]/)
  const caskroom = segments.indexOf("Caskroom")
  const cask = caskroom === -1 ? undefined : segments[caskroom + 1]
  if (cask) return brewUpgrade("--cask", cask)
  const cellar = segments.indexOf("Cellar")
  const formula = cellar === -1 ? undefined : segments[cellar + 1]
  if (formula) return brewUpgrade("--formula", formula)
  if (/^\/(usr\/(bin|lib|lib64|libexec|share)|snap)\//.test(resolvedPath))
    return {
      manual: `${HARNESSES[harness].label} was installed by a system package manager. Update it with that package manager.`,
    }
  if (harness === "cursor") {
    // The Windows distribution is Node running the CLI's entry file, so `update` follows the file.
    const windows = /[\\/]node\.exe$/i.test(executablePath)
    return {
      plan: {
        file: executablePath,
        args: windows ? [executablePath.replace(/node\.exe$/i, "index.js"), "update"] : ["update"],
        display: SELF_UPDATE.cursor,
        env: { CURSOR_INVOKED_AS: "cursor-agent" },
      },
    }
  }
  return { plan: { file: executablePath, args: ["update"], display: SELF_UPDATE[harness] } }
}

/** The last line a command printed, which updaters use for their summary. */
export const lastLine = (result: Pick<CommandResult, "stdout" | "stderr">): string =>
  stripVTControlCharacters(`${result.stdout}\n${result.stderr}`)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .at(-1) ?? ""

export interface ProviderUpdatesService {
  readonly status: (harness: Harness) => Effect.Effect<ProviderUpdateStatus>
  /** Compares the installed version with the latest release and publishes the result. */
  readonly check: (harness: Harness) => Effect.Effect<ProviderUpdateStatus>
  /** Starts the update and returns at once; the outcome is published when the updater exits. */
  readonly install: (harness: Harness) => Effect.Effect<ProviderUpdateStatus, Error>
}

export class ProviderUpdates extends Context.Tag("MeldShell/ProviderUpdates")<
  ProviderUpdates,
  ProviderUpdatesService
>() {}

/** The outside world the service touches, replaceable in tests. */
export interface UpdateDependencies {
  readonly fetchText: (url: string) => Promise<string>
  readonly run: (plan: UpdatePlan) => Promise<CommandResult>
  readonly resolvePath: (path: string) => Promise<string>
  readonly now: () => number
}

const defaultDependencies: UpdateDependencies = {
  fetchText: async (url) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json, text/plain, */*" },
    })
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}.`)
    return response.text()
  },
  run: (plan) =>
    runCommand(plan.file, plan.args, {
      timeoutMs: INSTALL_TIMEOUT_MS,
      ...(plan.env === undefined ? {} : { env: plan.env }),
    }),
  resolvePath: (path) => realpath(path).catch(() => path),
  now: Date.now,
}

type Providers = CodexProvider | ClaudeProvider | CursorProvider

/** What an updater run left behind, reported by the version check that follows it. */
interface InstallOutcome {
  readonly output: string
  /** Whether the harness was reloaded, or only probed because turns were running. */
  readonly restarted: boolean
}

export const makeProviderUpdates = (
  deps: UpdateDependencies,
): Effect.Effect<
  ProviderUpdatesService,
  never,
  HostEvents | CoreClient | Providers | Scope.Scope
> =>
  Effect.gen(function* () {
    const events = yield* HostEvents
    const core = yield* CoreClient
    const context = yield* Effect.context<Providers>()
    const runtime = yield* Effect.runtime<Providers>()
    const scope = yield* Effect.scope
    const runFork = (effect: Effect.Effect<unknown, never, Providers>): void => {
      Runtime.runFork(runtime)(effect.pipe(Effect.forkIn(scope)))
    }

    const statuses = new Map<Harness, ProviderUpdateStatus>()
    const latest = new Map<Harness, { readonly version: string; readonly at: number }>()
    const outcomes = new Map<Harness, InstallOutcome>()

    const current = (harness: Harness): ProviderUpdateStatus =>
      statuses.get(harness) ?? unknownUpdateStatus(harness)
    const publish = (status: ProviderUpdateStatus): Effect.Effect<ProviderUpdateStatus> => {
      statuses.set(status.harness, status)
      return events.publish({ _tag: "ProviderUpdateChanged", status }).pipe(Effect.as(status))
    }
    const providerStatus = (harness: Harness) =>
      Effect.flatMap(providerFor(harness), (service) => service.status)
    const resolve = (harness: Harness, executablePath: string) =>
      Effect.promise(() => deps.resolvePath(executablePath)).pipe(
        Effect.map((resolved) => planUpdate(harness, executablePath, resolved)),
      )
    const timestamp = (): string => new Date(deps.now()).toISOString()

    const latestVersion = (harness: Harness): Effect.Effect<string, Error> =>
      Effect.suspend(() => {
        const cached = latest.get(harness)
        if (cached !== undefined && deps.now() - cached.at < LATEST_TTL_MS)
          return Effect.succeed(cached.version)
        const source = LATEST_SOURCES[harness]
        return attempt(() => deps.fetchText(source.url)).pipe(
          Effect.flatMap((text) => {
            const version = source.parse(text)
            return version === null
              ? Effect.fail(new Error("The release feed did not name a version."))
              : Effect.succeed(version)
          }),
          Effect.tap((version) =>
            Effect.sync(() => latest.set(harness, { version, at: deps.now() })),
          ),
          Effect.mapError(
            (cause) =>
              new Error(
                `Could not read the latest ${HARNESSES[harness].label} version: ${cause.message}`,
              ),
          ),
        )
      })

    /** Words the result of a check, including the updater run that led to it. */
    const describe = (
      harness: Harness,
      order: VersionOrder,
      version: string,
      newest: string,
      resolution: UpdateResolution,
    ): string => {
      const { label } = HARNESSES[harness]
      const outcome = outcomes.get(harness)
      outcomes.delete(harness)
      if (order !== "behind") {
        if (outcome === undefined) return `${label} is up to date.`
        return outcome.restarted
          ? `${label} ${version} is installed.`
          : `${label} ${version} is installed. Turns that were running keep the previous version.`
      }
      if (outcome !== undefined)
        return `${label} is still ${version} after the update; its updater said: ${outcome.output}`
      const available = `${label} ${newest} is available.`
      return "manual" in resolution ? `${available} ${resolution.manual}` : available
    }

    /** Compares an installed version with the latest release and publishes the result. */
    const compare = (
      harness: Harness,
      version: string,
      resolution: UpdateResolution,
    ): Effect.Effect<ProviderUpdateStatus> =>
      Effect.gen(function* () {
        const newest = yield* Effect.either(latestVersion(harness))
        if (Either.isLeft(newest))
          return yield* publish({
            ...current(harness),
            state: "error",
            message: newest.left.message,
            checkedAt: timestamp(),
          })
        const order = compareVersions(version, newest.right)
        return yield* publish({
          ...current(harness),
          state: order === "behind" ? "available" : "current",
          latestVersion: newest.right,
          message: describe(harness, order, version, newest.right, resolution),
          checkedAt: timestamp(),
        })
      })

    const check = (harness: Harness): Effect.Effect<ProviderUpdateStatus, never, Providers> =>
      Effect.gen(function* () {
        const known = current(harness)
        if (known.state === "updating") return known
        const status = yield* providerStatus(harness)
        if (status.version === null || status.executablePath === null) {
          outcomes.delete(harness)
          return yield* publish(unknownUpdateStatus(harness))
        }
        const resolution = yield* resolve(harness, status.executablePath)
        yield* publish({
          ...known,
          harness,
          state: "checking",
          installedVersion: status.version,
          command: "plan" in resolution ? resolution.plan.display : null,
          canUpdate: "plan" in resolution,
          message: "Checking for updates…",
        })
        return yield* compare(harness, status.version, resolution)
      })

    /** Runs the updater, then reloads the harness so its probe reports the version now installed. */
    const runInstall = (
      harness: Harness,
      plan: UpdatePlan,
    ): Effect.Effect<unknown, never, Providers> =>
      Effect.gen(function* () {
        const result = yield* attempt(() => deps.run(plan))
        const output = lastLine(result)
        if (result.exitCode !== 0)
          return yield* Effect.fail(
            new Error(`${plan.display} failed${output === "" ? "." : `: ${output}`}`),
          )
        // A restart fails running turns, so a busy host only probes the harness again.
        const active = yield* core.GetActiveTurnCount().pipe(Effect.orElseSucceed(() => 1))
        outcomes.set(harness, {
          output: output === "" ? "nothing" : output,
          restarted: active === 0,
        })
        yield* publish({
          ...current(harness),
          state: "checking",
          message: "Update finished. Checking the installed version…",
        })
        const service = yield* providerFor(harness)
        yield* (active === 0 ? service.restart : service.refresh).pipe(
          Effect.catchAll(Effect.logError),
        )
      }).pipe(
        Effect.catchAll((cause) =>
          publish({
            ...current(harness),
            state: "error",
            message: cause.message,
            checkedAt: timestamp(),
          }),
        ),
      )

    const install = (harness: Harness): Effect.Effect<ProviderUpdateStatus, Error, Providers> =>
      Effect.gen(function* () {
        const known = current(harness)
        if (known.state === "updating") return known
        const status = yield* providerStatus(harness)
        if (status.executablePath === null)
          return yield* Effect.fail(new Error(`${HARNESSES[harness].label} is not installed.`))
        const resolution = yield* resolve(harness, status.executablePath)
        if ("manual" in resolution) return yield* Effect.fail(new Error(resolution.manual))
        const started = yield* publish({
          ...known,
          harness,
          state: "updating",
          installedVersion: status.version,
          command: resolution.plan.display,
          canUpdate: true,
          message: `Running ${resolution.plan.display}…`,
        })
        runFork(runInstall(harness, resolution.plan))
        return started
      })

    /** Whether a settled probe calls for a comparison: a new version, or the one after an update. */
    const needsCheck = (harness: Harness, version: string | null): boolean => {
      const known = current(harness)
      if (known.state === "updating") return false
      if (outcomes.has(harness)) return true
      if (version === null) return known.state !== "unknown"
      return known.state === "unknown" || known.installedVersion !== version
    }
    yield* Stream.fromQueue(yield* events.subscribe).pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => {
          if (event._tag !== "ProviderStatusChanged" || event.status.availability === "probing")
            return
          if (needsCheck(event.status.harness, event.status.version))
            runFork(check(event.status.harness))
        }),
      ),
      Effect.forkScoped,
    )
    yield* Effect.forEach(HARNESS_LIST, check, { discard: true }).pipe(
      Effect.delay(RECHECK_INTERVAL),
      Effect.forever,
      Effect.forkScoped,
    )

    return {
      status: (harness) => Effect.sync(() => current(harness)),
      check: (harness) => Effect.provide(check(harness), context),
      install: (harness) => Effect.provide(install(harness), context),
    }
  })

export const providerUpdatesLive: Layer.Layer<
  ProviderUpdates,
  never,
  HostEvents | CoreClient | Providers
> = Layer.scoped(ProviderUpdates, makeProviderUpdates(defaultDependencies))
