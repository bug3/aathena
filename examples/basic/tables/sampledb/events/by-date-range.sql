-- @param annotations add runtime validation on top of type safety.
--
-- @param status     → only 'active', 'pending' or 'done' allowed
-- @param startDate  → must be YYYY-MM-DD
-- @param endDate    → must be YYYY-MM-DD
-- @param rowLimit   → must be a positive integer

-- @param status enum('active','pending','done')
-- @param startDate isoDate
-- @param endDate isoDate
-- @param rowLimit positiveInt

SELECT event_id, event_name, price, created_at
FROM events
WHERE status = '{{status}}'
  AND created_at BETWEEN '{{startDate}}' AND '{{endDate}}'
ORDER BY created_at DESC
LIMIT {{rowLimit}}
