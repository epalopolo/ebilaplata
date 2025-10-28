CREATE TABLE IF NOT EXISTS meta (
  id SERIAL PRIMARY KEY,
  headers TEXT[]
);

CREATE TABLE IF NOT EXISTS cells (
  id SERIAL PRIMARY KEY,
  row_idx INTEGER NOT NULL,
  col_idx INTEGER NOT NULL,
  value TEXT,
  user_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cells_row_col ON cells(row_idx, col_idx);

