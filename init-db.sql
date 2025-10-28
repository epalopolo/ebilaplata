-- Crear tabla para metadata (headers)
CREATE TABLE IF NOT EXISTS meta (
  id SERIAL PRIMARY KEY,
  headers TEXT[]
);

-- Crear tabla para las celdas
CREATE TABLE IF NOT EXISTS cells (
  id SERIAL PRIMARY KEY,
  row_idx INTEGER NOT NULL,
  col_idx INTEGER NOT NULL,
  value TEXT,
  user_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_cells_position ON cells(row_idx, col_idx);

-- Insertar datos iniciales de ejemplo (headers)
INSERT INTO meta (headers) VALUES 
(ARRAY['Nombre', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'])
ON CONFLICT DO NOTHING;
