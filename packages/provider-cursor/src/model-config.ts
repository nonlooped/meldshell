import { record, records, text, type RecordValue } from "./client"
import { cursorModels } from "./protocol"
import type { ProviderModelCatalogEntry } from "@meldshell/contracts"

export const effortOption = (options: RecordValue[]): RecordValue | undefined =>
  options.find((option) =>
    ["effort", "reasoning", "reasoning_effort", "thought_level"].includes(text(option.id)),
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
  catalog: RecordValue,
  session: RecordValue,
  image: boolean,
): ProviderModelCatalogEntry[] =>
  records(catalog.models).flatMap((model) => {
    const id = text(model.value)
    if (!id) return []
    const options = records(model.configOptions)
    const thinking = options.find((option) => option.id === "thinking")
    const values = thinking ? records(thinking.options).map((option) => text(option.value)) : [null]
    const effort = effortOption(options)
    const fast = options.find((option) => option.id === "fast")
    return values.map((value) => {
      const parameters = options.map(
        (option) =>
          `${text(option.id)}=${option.id === "thinking" ? value : text(option.currentValue)}`,
      )
      const slug = `${id}[${parameters.join(",")}]`
      const base = cursorModels(
        {
          models: {
            availableModels: [
              {
                modelId: slug,
                name: `${text(model.name) || id}${value === "true" ? " Thinking" : ""}`,
              },
            ],
          },
        },
        image,
      )[0]!
      return {
        ...base,
        reasoningEfforts: records(effort?.options)
          .map((option) => text(option.value))
          .filter(Boolean),
        defaultReasoningEffort: text(effort?.currentValue) || null,
        fastServiceTier: records(fast?.options).some((option) => option.value === "true")
          ? "fast"
          : null,
        isDefault:
          id === record(session.models).currentModelId &&
          (value === null || value === thinking?.currentValue),
      }
    })
  })
