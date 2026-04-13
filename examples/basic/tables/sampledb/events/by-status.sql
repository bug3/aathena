-- Basic query: parameter types are inferred from SQL context.
--
-- '{{status}}'  → string  (quoted)
-- {{limit}}     → number  (LIMIT keyword)

SELECT event_id, event_name, price, created_at
FROM events
WHERE status = '{{status}}'
ORDER BY created_at DESC
LIMIT {{limit}}
