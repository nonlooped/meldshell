import { readFile } from "node:fs/promises"
import { extname } from "node:path"
import type { TurnDispatch } from "@meldshell/contracts"
import { referenceText } from "@meldshell/provider-runtime"

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

interface PiImage {
  readonly type: "image"
  readonly data: string
  readonly mimeType: string
}

const image = async (type: "image" | "localImage", value: string): Promise<PiImage> => {
  if (type === "localImage") {
    const mimeType = IMAGE_TYPES[extname(value).toLowerCase()]
    if (!mimeType) throw new Error("Pi images must be PNG, JPEG, GIF, or WebP.")
    const bytes = await readFile(value)
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error("The attached image exceeds 20 MB.")
    return { type: "image", mimeType, data: bytes.toString("base64") }
  }
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value)
  if (!match) throw new Error("Pi image attachments must contain PNG, JPEG, GIF, or WebP data.")
  return { type: "image", mimeType: match[1]!, data: match[2]!.replace(/\s/g, "") }
}

/** The fields of Pi's `prompt` command for a turn: its text, references, and images. */
export const piPrompt = async (
  dispatch: Pick<TurnDispatch, "text" | "attachments">,
  acceptsImages: boolean,
): Promise<{ message: string; images?: PiImage[] }> => {
  const references: string[] = []
  const images: PiImage[] = []
  for (const attachment of dispatch.attachments) {
    if (attachment.type === "mention" || attachment.type === "skill") {
      references.push(referenceText(attachment))
      continue
    }
    if (!acceptsImages) throw new Error("The selected Pi model does not accept images.")
    images.push(await image(attachment.type, attachment.value))
  }
  const message = [dispatch.text, ...references].filter(Boolean).join("\n\n")
  return images.length ? { message, images } : { message }
}
