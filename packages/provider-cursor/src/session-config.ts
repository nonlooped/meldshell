import { homedir } from "node:os"
import { RequestError } from "@agentclientprotocol/sdk"
import {
  asRecord,
  asRecords,
  asText,
  type ProviderModelCatalogEntry,
  type TurnDispatch,
  type UnknownRecord,
} from "@meldshell/contracts"
import type { CursorClient } from "./client"
import { effortOption, modelSelection, parameterizedModels } from "./model-config"
import { cursorModels } from "./protocol"

/** The part of a Cursor session that its configuration reads and updates. */
export interface ConfigurableSession {
  readonly client: CursorClient
  readonly sessionId: string
  readonly init: UnknownRecord
  configuration: UnknownRecord
}

/** Cursor names MeldShell's default mode `agent`; plan and ask share their names. */
export const cursorMode = (mode: TurnDispatch["mode"]): string =>
  mode === "default" ? "agent" : mode

/** Whether the session's agent accepts images in a prompt. */
export const acceptsImages = (session: Pick<ConfigurableSession, "init">): boolean =>
  asRecord(asRecord(session.init.agentCapabilities).promptCapabilities).image === true

const configOption = (session: ConfigurableSession, category: string): UnknownRecord | undefined =>
  asRecords(session.configuration.configOptions).find(
    (option) => option.category === category || option.id === category,
  )

const setConfigOption = async (
  session: ConfigurableSession,
  configId: string,
  value: string,
): Promise<void> => {
  const result = await session.client.run((agent) =>
    agent.request("session/set_config_option", { sessionId: session.sessionId, configId, value }),
  )
  session.configuration = { ...session.configuration, ...result }
}

/** Selects a model and mode, through config options where the release offers them. */
const configure = async (session: ConfigurableSession, model: string, mode: string) => {
  for (const [category, value, fallback] of [
    ["model", model, "session/set_model"],
    ["mode", mode, "session/set_mode"],
  ] as const) {
    const option = configOption(session, category)
    if (option) await setConfigOption(session, asText(option.id), value)
    else
      await session.client.run((agent) =>
        agent.request(fallback, {
          sessionId: session.sessionId,
          [category === "model" ? "modelId" : "modeId"]: value,
        }),
      )
  }
}

/**
 * Prepares a session for a turn. A parameterized model is chosen by its base model, then each of
 * its parameters, such as reasoning effort and speed, is set to a value Cursor still offers.
 */
export const configureModel = async (
  session: ConfigurableSession,
  model: string,
  mode: string,
  effort: string | null = null,
  speed?: "standard" | "fast",
): Promise<void> => {
  const selection = modelSelection(model)
  const parameterized = asRecords(configOption(session, "model")?.options).some(
    (option) => option.value === selection.model,
  )
  await configure(session, parameterized ? selection.model : model, mode)
  if (!parameterized) return
  const options = asRecords(session.configuration.configOptions)
  const reasoning = effortOption(options)
  if (reasoning && effort !== null) selection.parameters.set(asText(reasoning.id), effort)
  if (speed && options.some((option) => option.id === "fast"))
    selection.parameters.set("fast", String(speed === "fast"))
  for (const [id, value] of selection.parameters) {
    const option = asRecords(session.configuration.configOptions).find((entry) => entry.id === id)
    if (!option || !asRecords(option.options).some((entry) => entry.value === value))
      throw new Error(
        `Cursor no longer supports ${id}=${value} for ${selection.model}. Refresh the model catalog.`,
      )
    await setConfigOption(session, id, value)
  }
}

/** The models Cursor offers, from its catalog or, on older releases, a new session. */
export const discoverModels = async (
  session: ConfigurableSession,
): Promise<ProviderModelCatalogEntry[]> => {
  const image = acceptsImages(session)
  try {
    const catalog = await session.client.run((agent) =>
      agent.request<UnknownRecord>("cursor/list_available_models", {}),
    )
    return parameterizedModels(catalog, session.configuration, image)
  } catch (cause) {
    if (!(cause instanceof RequestError) || cause.code !== -32601) throw cause
    // Older releases only expose their model catalog through a new session.
    session.configuration = await session.client.run((agent) =>
      agent.request("session/new", { cwd: homedir(), mcpServers: [] }),
    )
    return cursorModels(session.configuration, image)
  }
}
