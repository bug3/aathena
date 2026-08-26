-- Complex Glue types: arrays, maps and structs come back parsed, recursively.
--
-- Note which columns are nullable. Athena guarantees NOT NULL only for
-- partition keys, so `dt` is the one column typed without `| null`.
--
-- '{{dt}}'       → string  (quoted)
-- {{rowLimit}}   → number  (LIMIT keyword)

SELECT order_id, placed_at, tags, metadata, address, items, dt
FROM orders
WHERE dt = '{{dt}}'
ORDER BY placed_at DESC
LIMIT {{rowLimit}}
