import type { ComposerAttachment } from "@meldshell/contracts"

/** Browser images are transmitted as content, never as paths on the client device. */
export function selectBrowserImages(): Promise<ComposerAttachment[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.multiple = true
    input.addEventListener("cancel", () => resolve([]), { once: true })
    input.addEventListener(
      "change",
      () => {
        void Promise.all(
          [...(input.files ?? [])].map(async (file) => {
            if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024)
              throw new Error("Choose images smaller than 2 MB each.")
            const value = await new Promise<string>((done, fail) => {
              const reader = new FileReader()
              reader.onload = () => done(String(reader.result))
              reader.onerror = () => fail(new Error("Could not read this image."))
              reader.readAsDataURL(file)
            })
            return { type: "image" as const, value, name: file.name, previewUrl: value }
          }),
        ).then(resolve, reject)
      },
      { once: true },
    )
    input.click()
  })
}
