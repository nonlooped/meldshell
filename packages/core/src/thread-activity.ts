export const threadActivitySql = `CASE
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
            FROM turns r WHERE r.thread_id = t.id ORDER BY r.started_at DESC LIMIT 1
          ), 'idle')
        END`
