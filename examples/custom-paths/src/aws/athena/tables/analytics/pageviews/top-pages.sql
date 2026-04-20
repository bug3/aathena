-- @param startDate isoDate
-- @param endDate isoDate
-- @param rowLimit positiveInt

SELECT page_url, SUM(view_count) AS total_views, COUNT(DISTINCT session_id) AS unique_sessions
FROM pageviews
WHERE created_at BETWEEN '{{startDate}}' AND '{{endDate}}'
GROUP BY page_url
ORDER BY total_views DESC
LIMIT {{rowLimit}}
