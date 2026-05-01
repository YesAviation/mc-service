UPDATE users
SET role = 'admin'
WHERE id = (
    SELECT id
    FROM users
    ORDER BY created_at
    LIMIT 1
)
AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE role = 'admin'
);
