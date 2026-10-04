/* Download links retain the releases page as a fallback when the platform or asset is unavailable. */
import { downloadPlatform } from "./download-platform"

const repo = "nonlooped/meldshell"
const platform = downloadPlatform(navigator.userAgent)
const links = document.querySelectorAll<HTMLAnchorElement>("[data-download]")

if (platform) {
  for (const link of links) {
    const label = link.querySelector<HTMLElement>("[data-download-label]")
    if (label) label.textContent = `Download for ${platform.name}`
    for (const icon of link.querySelectorAll<HTMLElement>("[data-download-icon]")) {
      const active = icon.dataset.downloadIcon === platform.name
      icon.classList.toggle("hidden", !active)
      icon.classList.toggle("contents", active)
    }
  }
}

type Release = {
  assets: { name: string; browser_download_url: string }[]
}

async function resolveDownload() {
  if (!platform || links.length === 0) return
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    })
    if (!response.ok) return
    const release = (await response.json()) as Release
    const asset = release.assets.find((candidate) => candidate.name.endsWith(platform.extension))
    if (!asset) return
    for (const link of links) link.href = asset.browser_download_url
  } catch {
    // The static releases link still works if GitHub is unreachable.
  }
}

void resolveDownload()
