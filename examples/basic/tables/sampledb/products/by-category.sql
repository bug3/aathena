-- Complex types: array, map and struct columns are fully typed.
-- Athena returns these as flat strings, aathena parses them automatically.

-- @param category string

SELECT product_id, name, tags, attributes, shipping_address
FROM products
WHERE category = '{{category}}'
LIMIT {{rowLimit}}
