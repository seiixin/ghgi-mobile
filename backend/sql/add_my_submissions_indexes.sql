-- Improves /api/my-submissions performance

-- main index (recommended)
CREATE INDEX idx_submissions_created_by_id ON submissions(created_by, id);

-- optional indexes (enable if you filter heavily by year/status)
CREATE INDEX idx_submissions_created_by_year ON submissions(created_by, year);
CREATE INDEX idx_submissions_created_by_status ON submissions(created_by, status);
