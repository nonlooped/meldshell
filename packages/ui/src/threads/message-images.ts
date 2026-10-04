/** Images sent with a user message are stored in its durable event payload. */
export function messageImages(payload: unknown): { src: string; alt: string }[] {
  if (!payload || typeof payload !== "object" || !("attachments" in payload)) return []
  if (!Array.isArray(payload.attachments)) return []
  return payload.attachments.flatMap((attachment: unknown, index: number) => {
    if (
      !attachment ||
      typeof attachment !== "object" ||
      !("type" in attachment) ||
      attachment.type !== "image" ||
      !("value" in attachment) ||
      typeof attachment.value !== "string" ||
      !/^(data:image\/|https:\/\/)/i.test(attachment.value)
    )
      return []
    const alt =
      "name" in attachment && typeof attachment.name === "string" && attachment.name
        ? attachment.name
        : `Attached image ${index + 1}`
    return [{ src: attachment.value, alt }]
  })
}
