import type { Element, Root, RootContent } from "hast"

export function webLinkLabel(
  fetched: string | null | undefined,
  supplied: string | undefined,
  original: string,
): string {
  const label = (fetched || supplied || original).trim()
  return label && !/(?:https?:\/\/|www\.)|^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(label)
    ? label
    : "Web page"
}

export interface FileReference {
  path: string
  line?: number
  endLine?: number
  skill: boolean
}

const validLine = (line?: number): boolean =>
  line === undefined || (Number.isSafeInteger(line) && line > 0)

export function fileReference(value: string): FileReference | null {
  let path: string
  try {
    path = decodeURIComponent(value).replaceAll("\\", "/")
  } catch {
    return null
  }
  if (/^file:\/\/\//i.test(path)) path = path.slice(7)
  if (/^\/[a-z]:\//i.test(path)) path = path.slice(1)
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path) && !/^[a-z]:\//i.test(path)) return null
  const location = /(?::(\d+)(?::\d+)?|#L(\d+)(?:-L?(\d+))?)$/i.exec(path)
  if (location) path = path.slice(0, location.index)
  if (!path || /[\r\n\0?#]/.test(path)) return null
  const name = path.split("/").at(-1) ?? ""
  if (
    !path.includes("/") &&
    !/^\.?[\w@-]+(?:\.[\w-]+)+$/.test(name) &&
    !/^\.[\w-]+$/.test(name) &&
    !/^(?:Dockerfile|Makefile|LICENSE)$/.test(name)
  )
    return null
  const line = location ? Number(location[1] ?? location[2]) : undefined
  const endLine = location?.[3] ? Number(location[3]) : undefined
  if (!validLine(line) || !validLine(endLine)) return null
  if (endLine !== undefined && endLine < (line ?? 1)) return null
  return {
    path,
    line,
    endLine,
    skill: name.toLowerCase() === "skill.md",
  }
}

const fileExtensions = new Set(
  "ts tsx js jsx mjs cjs mts cts json jsonc md markdown html htm css scss sass less vue svelte py rs go java kt kts cs c cpp cc h hpp rb php swift sh bash zsh ps1 psm1 bat cmd sql yaml yml toml xml ini cfg conf txt log csv tsv svg png jpg jpeg gif webp avif ico pdf docx xlsx pptx lock prisma graphql proto".split(
    " ",
  ),
)

export function inlineFileReference(value: string): FileReference | null {
  if (/\s/.test(value) || value.startsWith("@")) return null
  const reference = fileReference(value)
  if (!reference) return null
  const name = reference.path.split("/").at(-1) ?? ""
  const extension = name.split(".").at(-1)?.toLowerCase() ?? ""
  return fileExtensions.has(extension) ||
    /^\.(?:env(?:\.[\w-]+)?|gitignore|npmrc|editorconfig)$/.test(name) ||
    /^(?:Dockerfile|Makefile|LICENSE)$/.test(name)
    ? reference
    : null
}

// Windows destinations must be escaped before Markdown consumes their backslashes.
// Leave fenced and inline code verbatim, including examples of Markdown syntax.
export function prepareMarkdown(text: string): string {
  return text.replace(
    /((`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\2\s*(?=\n|$)|$)|(`+)[^`]*?\3)|\[([^\]\n]+)\]\((?:<([a-z]:[\\/][^>\n]+)>|([a-z]:[\\/](?:[^()\n]|\([^()\n]*\))*))\)/gi,
    (
      _match,
      code: string | undefined,
      _fence: string,
      _ticks: string,
      label: string,
      anglePath: string,
      barePath: string,
    ) => {
      if (code) return code
      const rawPath = anglePath ?? barePath
      const title = !anglePath ? /\s+("[^"\n]*"|'[^'\n]*')$/.exec(rawPath) : null
      const path = title ? rawPath.slice(0, title.index) : rawPath
      const encoded = encodeURI(path.replaceAll("\\", "/"))
        .replaceAll("(", "%28")
        .replaceAll(")", "%29")
      return `[${label}](${encoded}${title ? ` ${title[1]}` : ""})`
    },
  )
}

export function nodeText(node: Root | RootContent): string {
  return "value" in node
    ? String(node.value)
    : "children" in node
      ? node.children.map(nodeText).join("")
      : ""
}

export function tableDelimited(rows: readonly (readonly string[])[], separator: string): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/["\r\n\t,]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell))
        .join(separator),
    )
    .join("\n")
}

export function sourceTitles(payloads: readonly unknown[]): ReadonlyMap<string, string> {
  const titles = new Map<string, string>()
  const queue = payloads.slice(0, 5000).map((value) => ({ value, depth: 0 }))
  for (let index = 0; index < queue.length && index < 5000; index++) {
    const entry = queue[index]!
    if (!entry.value || typeof entry.value !== "object" || entry.depth > 8) continue
    const record = entry.value as Record<string, unknown>
    if (
      typeof record.url === "string" &&
      /^https?:\/\//i.test(record.url) &&
      typeof record.title === "string" &&
      record.title.trim()
    )
      titles.set(record.url, record.title.trim())
    for (const value of Object.values(record).slice(0, 100)) {
      if (value && typeof value === "object" && queue.length < 5000)
        queue.push({ value, depth: entry.depth + 1 })
    }
  }
  return titles
}

export function highlightText(value: string, query: string): RootContent[] {
  if (!query) return [{ type: "text", value }]
  const parts: RootContent[] = []
  const lower = value.toLowerCase()
  let start = 0
  let at = lower.indexOf(query.toLowerCase())
  while (at !== -1) {
    parts.push(
      { type: "text", value: value.slice(start, at) },
      {
        type: "element",
        tagName: "mark",
        properties: { "data-match": true },
        children: [{ type: "text", value: value.slice(at, at + query.length) }],
      },
    )
    start = at + query.length
    at = lower.indexOf(query.toLowerCase(), start)
  }
  parts.push({ type: "text", value: value.slice(start) })
  return parts
}

function decorateElement(
  node: Element,
  parent: Root | Element,
  prefix: string,
  headingIndex: number,
): number {
  if (/^h[1-6]$/.test(node.tagName)) {
    node.properties.id = `${prefix}-heading-${headingIndex++}`
    node.properties.tabIndex = -1
  }
  if (parent.type === "element") {
    if (node.tagName === "code" && parent.tagName === "pre") node.properties.dataBlock = true
    if (node.tagName === "img" && parent.tagName === "a") node.properties.dataLinked = true
  }
  return headingIndex
}

function searchableElement(node: Element): boolean {
  const classes = node.properties.className
  return (
    !["math", "svg"].includes(node.tagName) &&
    !(Array.isArray(classes) && classes.includes("katex"))
  )
}

export function enrichMarkdown({ prefix, query }: { prefix: string; query: string }) {
  return (tree: Root) => {
    let headingIndex = 0
    const visit = (parent: Root | Element, searchable = true) => {
      parent.children = parent.children.flatMap((node): RootContent[] => {
        if (node.type === "text") return searchable ? highlightText(node.value, query) : [node]
        if (node.type !== "element") return [node]
        headingIndex = decorateElement(node, parent, prefix, headingIndex)
        visit(node, searchable && searchableElement(node))
        return [node]
      }) as typeof parent.children
    }
    visit(tree)
  }
}
