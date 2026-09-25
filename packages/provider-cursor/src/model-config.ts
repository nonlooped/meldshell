import {
  asRecord,
  asRecords,
  asText,
  type ProviderModelCatalogEntry,
  type UnknownRecord,
} from "@meldshell/contracts"
import { cursorModels } from "./protocol"

export const effortOption = (options: UnknownRecord[]): UnknownRecord | undefined =>
  options.find((option) =>
    ["effort", "reasoning", "reasoning_effort", "thought_level"].includes(asText(option.id)),
  )

export const modelSelection = (
  slug: string,
): { model: string; parameters: Map<string, string> } => {
  const match = /^([^[]+)\[(.*)\]$/.exec(slug)
  return {
    model: match?.[1] ?? slug,
    parameters: new Map(
      (match?.[2] ?? "")
        .split(",")
        .filter(Boolean)
        .map((parameter) => {
          const index = parameter.indexOf("=")
          if (index < 1) throw new Error("Invalid Cursor model parameter.")
          return [parameter.slice(0, index), parameter.slice(index + 1)]
        }),
    ),
  }
}

/** Use Cursor's advertised parameter values, never a guessed matrix of model capabilities. */
export const parameterizedModels = (
  catalog: UnknownRecord,
  session: UnknownRecord,
  image: boolean,
): ProviderModelCatalogEntry[] =>
  asRecords(catalog.models).flatMap((model) => {
    const id = asText(model.value)
    if (!id) return []
    const options = asRecords(model.configOptions)
    const thinking = options.find((option) => option.id === "thinking")
    const values = thinking
      ? asRecords(thinking.options).map((option) => asText(option.value))
      : [null]
    const effort = effortOption(options)
    const fast = options.find((option) => option.id === "fast")
    return values.map((value) => {
      const parameters = options.map(
        (option) =>
          `${asText(option.id)}=${option.id === "thinking" ? value : asText(option.currentValue)}`,
      )
      const slug = `${id}[${parameters.join(",")}]`
      const base = cursorModels(
        {
          models: {
            availableModels: [
              {
                modelId: slug,
                name: `${asText(model.name) || id}${value === "true" ? " Thinking" : ""}`,
              },
            ],
          },
        },
        image,
      )[0]!
      return {
        ...base,
        reasoningEfforts: asRecords(effort?.options)
          .map((option) => asText(option.value))
          .filter(Boolean),
        defaultReasoningEffort: asText(effort?.currentValue) || null,
        fastServiceTier: asRecords(fast?.options).some((option) => option.value === "true")
          ? "fast"
          : null,
        isDefault:
          id === asRecord(session.models).currentModelId &&
          (value === null || value === thinking?.currentValue),
      }
    })
  })
