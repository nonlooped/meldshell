/** The separator a delimited-text file uses, judged by its extension, or null for other files. */
export function tableSeparator(path: string): "," | "\t" | null {
  const extension = path.toLowerCase().match(/\.[^./\\]+$/)?.[0]
  if (extension === ".csv") return ","
  if (extension === ".tsv" || extension === ".tab") return "\t"
  return null
}

/** Whether a file holds a single JSON document the viewer can show as a tree. */
export const isJsonPath = (path: string): boolean =>
  /\.(?:json|geojson|webmanifest|har)$/i.test(path)

/**
 * Splits delimited text into rows of cells. Follows RFC 4180: quoted cells may hold separators,
 * line breaks, and doubled quotes. Accepts LF or CRLF endings, a leading byte order mark, and a
 * missing final line break.
 */
export function parseDelimited(text: string, separator: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  const endRow = () => {
    row.push(cell)
    rows.push(row)
    row = []
    cell = ""
  }
  for (let index = text.charCodeAt(0) === 0xfeff ? 1 : 0; index < text.length; index++) {
    const char = text[index]!
    if (char === '"' && cell === "") {
      const quoted = quotedCell(text, index + 1)
      cell = quoted.value
      index = quoted.end
    } else if (char === separator) {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++
      endRow()
    } else cell += char
  }
  if (cell !== "" || row.length > 0) endRow()
  return rows
}

/** Reads a quoted cell starting after its opening quote; `end` is the closing quote's index. */
function quotedCell(text: string, start: number): { value: string; end: number } {
  let value = ""
  let index = start
  for (; index < text.length; index++) {
    if (text[index] !== '"') value += text[index]
    else if (text[index + 1] === '"') {
      value += '"'
      index++
    } else break
  }
  return { value, end: index }
}

const numeric = (value: string): number | null => {
  const trimmed = value.trim().replace(/,/g, "")
  if (trimmed === "" || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%?$/i.test(trimmed)) return null
  return Number.parseFloat(trimmed)
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

/** Orders two cells: numbers by value, then text in natural order, with empty cells last. */
export function compareCells(left: string, right: string): number {
  if (left === "" || right === "") return left === right ? 0 : left === "" ? 1 : -1
  const a = numeric(left)
  const b = numeric(right)
  if (a !== null && b !== null) return a - b
  if (a !== null) return -1
  if (b !== null) return 1
  return collator.compare(left, right)
}

/** A short description of what a JSON container holds, such as `3 keys` or `1 item`. */
export function jsonCount(value: object): string {
  const count = Array.isArray(value) ? value.length : Object.keys(value).length
  const noun = Array.isArray(value) ? "item" : "key"
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`
}
