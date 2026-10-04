import { BrowserWindow, ipcMain, nativeImage } from "electron"
import { IPC } from "@meldshell/contracts/ipc"
import { getMainWindow } from "./window"

/*
 * Threads waiting on the operator show as a count on the taskbar icon, the way a mail client
 * counts unread messages, and the window flashes once when a new one arrives while another
 * application is in front. Both clear as soon as nothing waits.
 */

let shown = 0

/** A badge of `count` on a red disc, drawn as an SVG so it stays crisp on every display scale. */
function badge(count: number): Electron.NativeImage {
  const label = count > 99 ? "99+" : String(count)
  const size = 32
  const fontSize = label.length > 2 ? 14 : 18
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="16" cy="16" r="15" fill="#e5484d" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
  <text x="16" y="16" dy="0.36em" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${label}</text>
</svg>`
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  )
}

function apply(window: BrowserWindow, count: number): void {
  if (window.isDestroyed()) return
  if (count === 0) {
    window.setOverlayIcon(null, "")
    window.flashFrame(false)
    return
  }
  window.setOverlayIcon(
    badge(count),
    `${count} ${count === 1 ? "thread needs" : "threads need"} attention`,
  )
  if (count > shown && !window.isFocused()) window.flashFrame(true)
}

export function registerAttentionIpc(): void {
  ipcMain.on(IPC.setAttention, (event, count: unknown) => {
    if (typeof count !== "number" || !Number.isFinite(count)) return
    // Only the main window carries the badge; a popped-out thread's window reports to it.
    const window = getMainWindow() ?? BrowserWindow.fromWebContents(event.sender)
    if (window === null) return
    apply(window, Math.max(0, Math.floor(count)))
    shown = Math.max(0, Math.floor(count))
  })
}
