/*
 * SQL shared by every query that lists threads, for a `threads` table aliased `t`. Each listing
 * reads the same derived fields; snapshots and inbox pages also share a listing order.
 */

/** Pinned threads first, then active ones, then archived ones. */
export const threadRank = (alias: string): string =>
  `CASE WHEN ${alias}.pinned = 1 THEN 0 WHEN ${alias}.status = 'active' THEN 1 ELSE 2 END`

/** The listing order: rank, then most recently updated, with the id breaking ties. */
export const THREAD_ORDER = `${threadRank("t")}, t.updated_at DESC, t.id DESC`

/** What a thread is doing now, from its approvals, running turn, queue, and latest turn. */
const THREAD_ACTIVITY = `CASE
  WHEN EXISTS (SELECT 1 FROM approvals a WHERE a.thread_id = t.id) THEN 'approval'
  WHEN EXISTS (SELECT 1 FROM turns r WHERE r.thread_id = t.id AND r.status = 'running')
    AND EXISTS (SELECT 1 FROM queued_inputs q WHERE q.thread_id = t.id) THEN 'queued'
  WHEN EXISTS (SELECT 1 FROM turns r WHERE r.thread_id = t.id AND r.status = 'running')
    THEN 'running'
  ELSE COALESCE((
    SELECT CASE r.status
      WHEN 'failed' THEN 'failed'
      WHEN 'interrupted' THEN 'interrupted'
      WHEN 'completed' THEN 'completed'
      ELSE 'idle'
    END
    FROM turns r WHERE r.thread_id = t.id AND r.rewound_at IS NULL
    ORDER BY r.started_at DESC LIMIT 1
  ), 'idle')
END`

/**
 * The derived `ThreadRow` fields: activity, queued input, turn count, the harness of the latest
 * turn still in the conversation, and whether a rewind can be undone.
 */
export const THREAD_SUMMARY = `${THREAD_ACTIVITY} AS activity,
  (SELECT COUNT(*) FROM queued_inputs q WHERE q.thread_id = t.id) AS queued_count,
  (SELECT COUNT(*) FROM turns r WHERE r.thread_id = t.id) AS turn_count,
  (SELECT r.harness FROM turns r WHERE r.thread_id = t.id AND r.rewound_at IS NULL
    ORDER BY r.started_at DESC, r.rowid DESC LIMIT 1) AS last_harness,
  EXISTS (SELECT 1 FROM thread_rewinds rw WHERE rw.thread_id = t.id) AS rewound`
