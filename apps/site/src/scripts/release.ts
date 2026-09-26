/* Fills in the latest release from GitHub: version, date, installer links and sizes. Everything
   has a static fallback in the markup. */

const repo = "nonlooped/meldshell"
const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`

const fill = (selector: string, text: string) => {
  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    element.textContent = text
  })
}

const github = async <T>(path: string): Promise<T | null> => {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      headers: { Accept: "application/vnd.github+json" },
    })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

type Release = {
  tag_name: string
  published_at: string
  assets: { name: string; browser_download_url: string; size: number }[]
}

void github<Release>("/releases/latest").then((release) => {
  if (!release) return
  fill("[data-release-version]", release.tag_name)
  fill(
    "[data-release-date]",
    new Date(release.published_at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  )
  document.querySelectorAll<HTMLAnchorElement>("[data-asset]").forEach((link) => {
    const asset = release.assets.find((candidate) => candidate.name.endsWith(link.dataset.asset!))
    if (!asset) return
    link.href = asset.browser_download_url
    const size = link.querySelector<HTMLElement>("[data-asset-size]")
    if (size) size.textContent = ` · ${megabytes(asset.size)}`
  })
})

export {}
