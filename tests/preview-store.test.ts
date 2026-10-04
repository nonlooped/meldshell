import assert from "node:assert/strict"
import test from "node:test"

// The store subscribes to the desktop bridge when its module is loaded.
Object.assign(globalThis, { window: { meldshell: { platform: "desktop", desktop: {} } } })

test("page navigation during preview close updates the address without reopening it", async () => {
  const { usePreviewStore } = await import("../packages/ui/src/preview/preview-store.ts")
  const threadId = "closing-preview"
  const preview = usePreviewStore.getState()
  preview.show(threadId, "https://github.com/")
  preview.toggle(threadId)
  preview.navigate(threadId, "https://github.com/login")

  assert.deepEqual(usePreviewStore.getState().threads[threadId], {
    open: false,
    url: "https://github.com/login",
    size: 45,
  })

  preview.toggle(threadId)
  assert.equal(usePreviewStore.getState().threads[threadId]?.open, true)
  preview.forget(threadId)
})
