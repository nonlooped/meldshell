import type { GitCommit } from "@meldshell/contracts/ipc"

export interface GraphRow {
  readonly commit: GitCommit
  readonly incoming: boolean
  readonly color: number
  readonly lane: number
  readonly width: number
  readonly edges: readonly { from: number; to: number; color: number; startsAtNode: boolean }[]
}

export function layoutGraph(commits: readonly GitCommit[]): GraphRow[] {
  const lanes: string[] = []
  const colors = new Map<string, number>()
  let nextColor = 0
  return commits.map((commit) => {
    const incoming = lanes.includes(commit.hash)
    if (!incoming) lanes.push(commit.hash)
    if (!colors.has(commit.hash)) colors.set(commit.hash, nextColor++)
    const color = colors.get(commit.hash)!
    commit.parents.forEach((parent, index) => {
      if (!colors.has(parent)) colors.set(parent, index === 0 ? color : nextColor++)
    })
    const before = [...lanes]
    const lane = lanes.indexOf(commit.hash)
    lanes.splice(lane, 1)
    for (const parent of [...commit.parents].reverse()) {
      if (!lanes.includes(parent)) lanes.splice(lane, 0, parent)
    }
    const edges = before.flatMap((hash, from) =>
      hash === commit.hash
        ? []
        : [{ from, to: lanes.indexOf(hash), color: colors.get(hash)!, startsAtNode: false }],
    )
    for (const parent of commit.parents)
      edges.push({
        from: lane,
        to: lanes.indexOf(parent),
        color: colors.get(parent)!,
        startsAtNode: true,
      })
    return { commit, lane, color, incoming, width: Math.max(before.length, lanes.length), edges }
  })
}
