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

// Reference and footnote definitions resolve across the whole message, so it stays one block.
// Labels may span lines and escape brackets, but never hold an unescaped one, which keeps a
// scan from each unmatched "[" short.
const definition = /^[ \t>*+\-\d.)]*\[(?:[^\\[\]]|\\[\s\S]){1,999}\]:/m
const listItem = /^( *)([-+*]|\d{1,9}[.)])( +|$)/
const fence = /^( *)((?:(?:[-+*]|\d{1,9}[.)]) +)*)(`{3,}|~{3,}|\${2,})(.*)$/
// Raw HTML blocks have several ending rules and are rare in replies, so the rest stays joined.
const html = /^ {0,3}<[a-z/!?]/i
const never = /(?!)/

// Splits Markdown into top-level runs that parse identically on their own, so finished runs
// keep their rendering while a reply streams. Boundaries are blank lines followed by an
// unindented line that cannot continue a list or an open fenced block. Ambiguous input stays
// joined; the concatenated blocks always equal the input.
export function markdownBlocks(text: string): string[] {
  if (definition.test(text)) return [text]
  const blocks: string[] = []
  const scan: BlockScan = { blank: false, items: [], container: 0 }
  let start = 0
  let at = 0
  for (const line of text.split("\n")) {
    if (startsBlock(line.replace(/\r$/, "").replaceAll("\t", "    "), scan) && at > start) {
      blocks.push(text.slice(start, at))
      start = at
    }
    at += line.length + 1
  }
  blocks.push(text.slice(start))
  return blocks
}

interface BlockScan {
  blank: boolean
  // Content columns of the open list items, outermost first.
  items: number[]
  closer?: RegExp | undefined
  // Lines indented less than this column close the open block along with its list item.
  container: number
}

const indentOf = (line: string): number => line.length - line.trimStart().length

// Advances the scan past one line and reports whether that line can begin a new block.
function startsBlock(line: string, scan: BlockScan): boolean {
  if (scan.closer) {
    if (!line.trim() || indentOf(line) >= scan.container) {
      if (scan.closer.test(line)) scan.closer = undefined
      return false
    }
    scan.closer = undefined
  }
  if (!line.trim()) {
    scan.blank = true
    return false
  }
  const item = trackItems(line, scan)
  const boundary = scan.blank && indentOf(line) === 0 && !item
  scan.blank = false
  openBlock(line, scan)
  return boundary
}

// Updates the open list items for this line and reports whether it starts an item.
function trackItems(line: string, scan: BlockScan): boolean {
  const indent = indentOf(line)
  const item = listItem.exec(line)
  // An item, a line after a blank, or an unindented line leaves items that need more indent.
  if (item || scan.blank || indent === 0)
    while ((scan.items.at(-1) ?? -1) > indent) scan.items.pop()
  if (!item) return false
  const spaces = item[3]?.length ?? 0
  scan.items.push(indent + (item[2]?.length ?? 0) + (spaces === 0 || spaces > 4 ? 1 : spaces))
  return true
}

// Records the fenced code, math, or HTML block this line opens, if any.
function openBlock(line: string, scan: BlockScan): void {
  scan.container = 0
  scan.closer = html.test(line) ? never : undefined
  const match = fence.exec(line)
  if (!match) return
  const [, indent = "", items = "", marks = "", info = ""] = match
  const column = indent.length + items.length
  const container = scan.items.filter((content) => content <= column).at(-1) ?? 0
  const mark = marks[0] === "$" ? "\\$" : marks[0]
  if (column - container > 3 || (mark !== "~" && info.includes(marks[0]!))) return
  // A fence closes within three spaces of the list item, or the message, that contains it.
  scan.container = container
  scan.closer = new RegExp(`^ {${container},${container + 3}}${mark}{${marks.length},}[ \\t]*$`)
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

export function enrichMarkdown({ prefix }: { prefix: string }) {
  return (tree: Root) => {
    let headingIndex = 0
    const visit = (parent: Root | Element) => {
      for (const node of parent.children) {
        if (node.type !== "element") continue
        headingIndex = decorateElement(node, parent, prefix, headingIndex)
        visit(node)
      }
    }
    visit(tree)
  }
}
