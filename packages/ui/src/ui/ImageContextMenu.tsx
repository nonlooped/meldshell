import { useState, type ReactElement } from "react"
import { ContextMenu, MenuAction } from "./controls"

async function imageBlob(source: string): Promise<Blob> {
  const response = await fetch(source)
  if (!response.ok) throw new Error("Image could not be downloaded.")
  return response.blob()
}

async function pngBlob(source: string): Promise<Blob> {
  const original = await imageBlob(source)
  if (original.type === "image/png") return original
  const bitmap = await createImageBitmap(original)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Image could not be copied.")
    context.drawImage(bitmap, 0, 0)
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Image could not be copied."))),
        "image/png",
      ),
    )
    return png
  } finally {
    bitmap.close()
  }
}

export function ImageContextMenu({
  trigger,
  source,
  name,
  onEnlarge,
}: {
  trigger: ReactElement<Record<string, unknown>>
  source: string
  name?: string
  onEnlarge?: () => void
}) {
  const [error, setError] = useState("")
  const run = (action: () => Promise<void>) =>
    void action().then(
      () => setError(""),
      (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
    )
  const save = async () => {
    const blob = await imageBlob(source)
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = name || "image"
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return (
    <>
      <ContextMenu trigger={trigger}>
        {onEnlarge && <MenuAction onClick={onEnlarge}>Enlarge image</MenuAction>}
        <MenuAction
          onClick={() =>
            run(async () =>
              navigator.clipboard.write([
                new ClipboardItem({ "image/png": await pngBlob(source) }),
              ]),
            )
          }
        >
          Copy image
        </MenuAction>
        <MenuAction onClick={() => run(save)}>Save image…</MenuAction>
        {/^https?:\/\//i.test(source) && (
          <MenuAction onClick={() => run(() => navigator.clipboard.writeText(source))}>
            Copy image address
          </MenuAction>
        )}
      </ContextMenu>
      {error && (
        <span role="alert" className="block text-[var(--color-deleted)] text-[11px]">
          {error}
        </span>
      )}
    </>
  )
}
