-- Multiple tables: each table under tables/{database}/{table}/ gets its own
-- generated type interface from the Glue schema.

-- @param minAge positiveInt

SELECT user_id, username, email, age
FROM users
WHERE is_active = true
  AND age >= {{minAge}}
ORDER BY username
LIMIT {{rowLimit}}
