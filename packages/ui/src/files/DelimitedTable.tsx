import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDown, ArrowUp } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { compareCells } from "./preview-model"

const ROW_HEIGHT = 30
/** Rows sampled to size columns and decide which ones hold numbers. */
const SAMPLE = 200

interface Sort {
  readonly column: number
  readonly descending: boolean
}

const numericCell = /^[-+]?[\d,]*\.?\d+(?:e[-+]?\d+)?%?$/i

/** Sizes each column from its sampled contents and right-aligns columns that are mostly numbers. */
function columnLayout(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  count: number,
) {
  return Array.from({ length: count }, (_, column) => {
    let longest = (header[column] ?? "").length + 3
    let filled = 0
    let numbers = 0
    for (const row of rows.slice(0, SAMPLE)) {
      const cell = row[column] ?? ""
      longest = Math.max(longest, cell.length)
      if (cell.trim() === "") continue
      filled++
      if (numericCell.test(cell.trim())) numbers++
    }
    return {
      width: Math.min(360, Math.max(72, Math.round(longest * 7.4 + 26))),
      numeric: filled > 0 && numbers / filled >= 0.8,
    }
  })
}

/** A CSV or TSV file as a scrollable table whose header sorts by column. */
export function DelimitedTable({ rows: parsed }: { rows: readonly (readonly string[])[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<Sort | null>(null)
  const header = parsed[0] ?? []
  const body = useMemo(() => parsed.slice(1), [parsed])
  const columnCount = parsed.reduce((widest, row) => Math.max(widest, row.length), 0)
  const columns = useMemo(
    () => columnLayout(header, body, columnCount),
    [header, body, columnCount],
  )
  const order = useMemo(() => {
    const indexes = body.map((_, index) => index)
    if (sort === null) return indexes
    const direction = sort.descending ? -1 : 1
    return indexes.sort(
      (a, b) =>
        compareCells(body[a]![sort.column] ?? "", body[b]![sort.column] ?? "") * direction || a - b,
    )
  }, [body, sort])
  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  })
  const items = virtualizer.getVirtualItems()
  const before = items[0]?.start ?? 0
  const after = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)
  const numberWidth = Math.max(44, String(order.length).length * 8 + 24)

  const toggleSort = (column: number) =>
    setSort((current) =>
      current?.column !== column
        ? { column, descending: false }
        : current.descending
          ? null
          : { column, descending: true },
    )

  return (
    <div
      ref={scrollRef}
      className={scrollClasses}
      role="region"
      aria-label="Table preview"
      tabIndex={0}
    >
      <table
        className={tableClasses}
        style={{
          width: numberWidth + columns.reduce((total, column) => total + column.width, 0),
        }}
        aria-rowcount={order.length + 1}
      >
        <colgroup>
          <col style={{ width: numberWidth }} />
          {columns.map((column, index) => (
            <col key={index} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" aria-label="Row" className="row-number" />
            {columns.map((column, index) => {
              const active = sort?.column === index
              const label = header[index] || `Column ${index + 1}`
              return (
                <th
                  key={index}
                  scope="col"
                  data-numeric={column.numeric || undefined}
                  aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
                >
                  <button
                    type="button"
                    className="motion-colors"
                    title={`Sort by ${label}`}
                    onClick={() => toggleSort(index)}
                  >
                    <span>{label}</span>
                    {active &&
                      (sort.descending ? (
                        <ArrowDown size={12} aria-hidden="true" />
                      ) : (
                        <ArrowUp size={12} aria-hidden="true" />
                      ))}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {before > 0 && (
            <tr aria-hidden="true">
              <td colSpan={columnCount + 1} style={{ height: before }} />
            </tr>
          )}
          {items.map((item) => {
            const index = order[item.index]!
            const row = body[index]!
            return (
              <tr key={index} aria-rowindex={item.index + 2}>
                <td className="row-number">{index + 1}</td>
                {columns.map((column, cellIndex) => {
                  const cell = row[cellIndex] ?? ""
                  return (
                    <td
                      key={cellIndex}
                      title={cell.length > 24 ? cell : undefined}
                      data-numeric={column.numeric || undefined}
                    >
                      {cell}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {after > 0 && (
            <tr aria-hidden="true">
              <td colSpan={columnCount + 1} style={{ height: after }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const scrollClasses = [
  "flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] text-[13px]",
  "[&:focus-visible]:[outline:1px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:-1px]",
].join(" ")

const tableClasses = [
  "min-w-full [table-layout:fixed] [border-collapse:separate] [border-spacing:0] [font-variant-numeric:tabular-nums]",
  "[&_th]:sticky [&_th]:top-[0] [&_th]:z-[1] [&_th]:h-[32px] [&_th]:p-0 [&_th]:bg-[var(--surface-menu)]",
  "[&_th]:border-b-[1px] [&_th]:border-b-[color:var(--line)] [&_th]:text-left [&_th]:font-semibold",
  "[&_th]:text-[var(--text-primary)] [&_th_button]:flex [&_th_button]:w-full [&_th_button]:h-full",
  "[&_th_button]:items-center [&_th_button]:gap-[4px] [&_th_button]:[padding:0_12px] [&_th_button]:border-0",
  "[&_th_button]:bg-transparent [&_th_button]:text-inherit [&_th_button]:[font:inherit] [&_th_button]:cursor-default",
  "[&_th_button:hover]:bg-[var(--surface-hover)] [&_th_button:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]",
  "[&_th_button:focus-visible]:[outline-offset:-2px] [&_th_button_span]:min-w-0 [&_th_button_span]:overflow-hidden",
  "[&_th_button_span]:text-ellipsis [&_th_button_span]:whitespace-nowrap",
  "[&_th[data-numeric]_button]:flex-row-reverse [&_th[data-numeric]_button]:justify-start",
  "[&_td]:h-[30px] [&_td]:[padding:0_12px] [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:whitespace-nowrap",
  "[&_td]:border-b-[1px] [&_td]:border-b-[color:var(--line-subtle)] [&_td]:text-[var(--text-secondary)]",
  "[&_td[data-numeric]]:text-right [&_tr:hover_td]:bg-[var(--surface-hover)]",
  "[&_tr:hover_td]:text-[var(--text-primary)] [&_th+th]:border-l-[1px] [&_th+th]:border-l-[color:var(--line-subtle)]",
  "[&_td+td]:border-l-[1px] [&_td+td]:border-l-[color:var(--line-subtle)]",
  "[&_.row-number]:sticky [&_.row-number]:left-[0] [&_.row-number]:bg-[var(--surface-menu)]",
  "[&_th.row-number]:z-[2] [&_td.row-number]:text-right [&_td.row-number]:text-[var(--text-tertiary)]",
  "[&_td.row-number]:text-[11px] [&_td.row-number]:[font-family:var(--font-mono)]",
].join(" ")
