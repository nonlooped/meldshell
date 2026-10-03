/**
 * Placeholders shaped like the content they stand in for. Each fades in after a short delay, so a
 * fast load swaps straight to its content, and announces itself by `label` to assistive tech.
 */
function SkeletonStatus({
  label,
  className = "",
  children,
}: {
  readonly label: string
  readonly className?: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={`motion-enter delay-150 ${className}`} role="status">
      <span className="sr-only">{label}</span>
      <div className="contents" aria-hidden="true">
        {children}
      </div>
    </div>
  )
}

function Bar({ width, className = "" }: { readonly width: string; readonly className?: string }) {
  return <span className={`skeleton h-[8px] ${className}`} style={{ width }} />
}

const responseLines = [
  ["94%", "88%", "97%", "61%"],
  ["91%", "72%"],
] as const

/** A user message on the right followed by a response's lines, twice over. */
export function TranscriptSkeleton({ className = "" }: { readonly className?: string }) {
  return (
    <SkeletonStatus label="Loading transcript…" className={className}>
      <div className="w-full max-w-[720px] [margin:0_auto] flex flex-col gap-[44px]">
        {responseLines.map((lines, turn) => (
          <div key={lines.join()} className="flex flex-col gap-[10px]">
            <span
              className="skeleton h-[42px] ml-[auto] rounded-[var(--radius-lg)]"
              style={{ width: turn === 0 ? "46%" : "32%" }}
            />
            <Bar width="22%" className="mt-[6px] h-[6px] opacity-70" />
            <div className="flex flex-col gap-[9px] mt-[6px]">
              {lines.map((width) => (
                <Bar key={width} width={width} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonStatus>
  )
}

/** A thread pane's header strip above its transcript placeholder. */
export function ThreadSkeleton() {
  return (
    <SkeletonStatus label="Loading thread…" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center h-[33px] [padding:0_10px] border-b-[1px] border-b-[color:var(--line-subtle)]">
        <Bar width="140px" />
      </div>
      <div className="[padding:36px_clamp(24px,_7vw,_104px)]">
        <TranscriptSkeleton />
      </div>
    </SkeletonStatus>
  )
}

const treeRows = [
  { indent: 0, width: "38%" },
  { indent: 0, width: "52%" },
  { indent: 1, width: "44%" },
  { indent: 1, width: "60%" },
  { indent: 1, width: "36%" },
  { indent: 0, width: "48%" },
  { indent: 0, width: "30%" },
  { indent: 0, width: "56%" },
] as const

function TreeRows({
  rows,
  depth,
  inset = 28,
}: {
  readonly rows: number
  readonly depth: number
  /** Space before the first level's icon, past the tree's chevron column. */
  readonly inset?: number
}) {
  return treeRows.slice(0, rows).map((row) => (
    <div
      key={row.width}
      className="flex items-center gap-[8px] h-[24px]"
      style={{ paddingLeft: inset + (depth === 0 ? row.indent : depth) * 14 }}
    >
      <span className="skeleton w-[12px] h-[12px] rounded-[3px] shrink-0" />
      <Bar width={row.width} />
    </div>
  ))
}

/** Rows the height of a file tree's, each an icon and a name. `depth` indents a nested listing. */
export function TreeSkeleton({
  label,
  rows = treeRows.length,
  depth = 0,
}: {
  readonly label: string
  readonly rows?: number
  readonly depth?: number
}) {
  return (
    <SkeletonStatus label={label}>
      <TreeRows rows={rows} depth={depth} />
    </SkeletonStatus>
  )
}

/** A source control panel: the commit box, then a list of changed files. */
export function GitSkeleton() {
  return (
    <SkeletonStatus label="Reading repository…" className="flex flex-col gap-[14px] p-[10px]">
      <span className="skeleton h-[56px] rounded-[var(--radius)]" />
      <span className="skeleton h-[26px] rounded-[var(--radius)]" />
      <div>
        <Bar width="34%" className="mb-[10px]" />
        <TreeRows rows={6} depth={0} inset={0} />
      </div>
    </SkeletonStatus>
  )
}

/** Lines of a diff or other code block. */
export function LinesSkeleton({ label }: { readonly label: string }) {
  return (
    <SkeletonStatus label={label} className="flex flex-col gap-[9px] [padding:12px_14px]">
      {["72%", "88%", "54%", "80%", "40%"].map((width) => (
        <Bar key={width} width={width} />
      ))}
    </SkeletonStatus>
  )
}
