-- Eliminar tablas existentes si existen
DROP TABLE IF EXISTS asignaciones CASCADE;
DROP TABLE IF EXISTS turnos CASCADE;
DROP VIEW IF EXISTS vista_turnos CASCADE;

-- 1. Tabla de turnos (slots de horario)
CREATE TABLE turnos (
  id SERIAL PRIMARY KEY,
  dia TEXT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  sala TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla de asignaciones (quién se anotó en cada puesto)
CREATE TABLE asignaciones (
  id SERIAL PRIMARY KEY,
  turno_id INTEGER REFERENCES turnos(id) ON DELETE CASCADE,
  puesto TEXT NOT NULL, -- 'Titular', 'Auxiliar 1', 'Auxiliar 2', 'Auxiliar 3'
  nombre_usuario TEXT, -- Nombre de quien se anotó (NULL si está vacío)
  disponible BOOLEAN DEFAULT TRUE, -- FALSE si dice "No disponible"
  fecha_asignacion TIMESTAMP DEFAULT NOW()
);

-- 3. Índices para mejorar rendimiento
CREATE INDEX idx_turnos_fecha ON turnos(fecha);
CREATE INDEX idx_turnos_sala ON turnos(sala);
CREATE INDEX idx_asignaciones_turno ON asignaciones(turno_id);

-- 4. Vista para consultas fáciles
CREATE VIEW vista_turnos AS
SELECT 
  t.id,
  t.dia,
  t.fecha,
  t.hora,
  t.sala,
  MAX(CASE WHEN a.puesto = 'Titular' THEN a.id END) as titular_id,
  MAX(CASE WHEN a.puesto = 'Titular' THEN COALESCE(a.nombre_usuario, '') END) as titular,
  MAX(CASE WHEN a.puesto = 'Titular' THEN a.disponible END) as titular_disponible,
  MAX(CASE WHEN a.puesto = 'Auxiliar 1' THEN a.id END) as auxiliar_1_id,
  MAX(CASE WHEN a.puesto = 'Auxiliar 1' THEN COALESCE(a.nombre_usuario, '') END) as auxiliar_1,
  MAX(CASE WHEN a.puesto = 'Auxiliar 1' THEN a.disponible END) as aux1_disponible,
  MAX(CASE WHEN a.puesto = 'Auxiliar 2' THEN a.id END) as auxiliar_2_id,
  MAX(CASE WHEN a.puesto = 'Auxiliar 2' THEN COALESCE(a.nombre_usuario, '') END) as auxiliar_2,
  MAX(CASE WHEN a.puesto = 'Auxiliar 2' THEN a.disponible END) as aux2_disponible,
  MAX(CASE WHEN a.puesto = 'Auxiliar 3' THEN a.id END) as auxiliar_3_id,
  MAX(CASE WHEN a.puesto = 'Auxiliar 3' THEN COALESCE(a.nombre_usuario, '') END) as auxiliar_3,
  MAX(CASE WHEN a.puesto = 'Auxiliar 3' THEN a.disponible END) as aux3_disponible
FROM turnos t
LEFT JOIN asignaciones a ON t.id = a.turno_id
GROUP BY t.id, t.dia, t.fecha, t.hora, t.sala
ORDER BY t.fecha, t.hora, t.sala;
