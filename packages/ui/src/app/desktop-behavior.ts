const editable = 'input, textarea, [contenteditable]:not([contenteditable="false"])'

// Chromium opens files dropped onto a page and shows a copy cursor while they hover. MeldShell has
// no file drop targets, so files are refused everywhere; text still drops into editable fields.
const refuseDrop = (event: DragEvent): void => {
  const files = event.dataTransfer?.types.includes("Files") ?? false
  if (!files && event.target instanceof Element && event.target.closest(editable)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = "none"
}

export function installDesktopBehavior(): void {
  document.addEventListener("dragover", refuseDrop)
  document.addEventListener("drop", refuseDrop)
}
