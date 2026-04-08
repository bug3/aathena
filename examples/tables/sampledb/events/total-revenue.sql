-- No parameters: generates a simple query function with no params interface.

SELECT
  DATE(created_at) AS day,
  COUNT(*) AS total_events,
  SUM(price) AS total_revenue
FROM events
WHERE status = 'active'
GROUP BY DATE(created_at)
ORDER BY day DESC
