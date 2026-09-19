import type { CanonicalEvent } from "@meldshell/contracts"

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

function toolStatus(
  event: CanonicalEvent,
  payload: Record<string, unknown>,
  item: Record<string, unknown>,
): { failed: boolean; status: string } {
  const failed =
    (event.kind === "error" && payload.willRetry !== true) ||
    item.status === "failed" ||
    item.status === "declined" ||
    item.success === false ||
    Boolean(item.error) ||
    (typeof item.exitCode === "number" && item.exitCode !== 0)
  let status = ""
  if (failed) status = "Failed"
  else if (payload.willRetry === true) status = "Retrying"
  else if (item.status === "inProgress") status = "Running"
  else if (item.status === "stopped") status = "Stopped"
  else if (item.status === "paused") status = "Paused"

  return { failed, status }
}

export function toolDetails(event: CanonicalEvent): {
  command: string
  cwd: string
  input: string
  output: string
  error: string
  images: string[]
  failed: boolean
  status: string
  progress: string
  exitCode: number | null
  outputFile: string | null
  parent: string | null
} {
  const payload = record(event.payload)
  const item = record(payload.item)
  const images: string[] = []
  const imageSource = (value: unknown): void => {
    if (
      typeof value === "string" &&
      /^(data:image\/(png|jpeg|gif|webp);base64,|https:\/\/)/i.test(value)
    )
      images.push(value)
  }
  const readable = (value: unknown): string => {
    if (value == null) return ""
    if (typeof value === "string") return value
    return JSON.stringify(
      value,
      (_key, entry: unknown) => {
        const block = record(entry)
        if (block.type === "image" || block.type === "input_image" || block.type === "inputImage") {
          const source = record(block.source)
          if (typeof block.data === "string" && typeof block.mimeType === "string")
            imageSource(`data:${block.mimeType};base64,${block.data}`)
          if (source.type === "base64")
            imageSource(`data:${source.media_type};base64,${source.data}`)
          imageSource(source.url)
          imageSource(block.image_url)
          imageSource(block.imageUrl)
          return "[Image]"
        }
        return entry
      },
      2,
    )
  }
  const input = readable(item.arguments ?? item.action ?? item.prompt ?? item.query)
  let output = readable(
    item.type === "commandExecution"
      ? item.aggregatedOutput
      : (item.contentItems ?? item.result ?? item.aggregatedOutput ?? item.agentsStates),
  )
  if (item.type === "imageGeneration" && typeof item.result === "string" && item.result) {
    imageSource(
      item.result.startsWith("data:") ? item.result : `data:image/png;base64,${item.result}`,
    )
    output = typeof item.revisedPrompt === "string" ? item.revisedPrompt : ""
  }
  const error = readable(item.error)
  const { failed, status } = toolStatus(event, payload, item)

  return {
    command: typeof item.command === "string" ? item.command : "",
    cwd: typeof item.cwd === "string" ? item.cwd : "",
    input,
    output,
    error,
    images: [...new Set(images)],
    failed,
    status,
    progress: typeof item.progress === "string" ? item.progress : "",
    exitCode: typeof item.exitCode === "number" ? item.exitCode : null,
    outputFile: typeof item.outputFile === "string" ? item.outputFile : null,
    parent: typeof item.parentToolUseId === "string" ? item.parentToolUseId : null,
  }
}
