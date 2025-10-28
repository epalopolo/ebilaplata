// server.js
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Serve static frontend
app.use('/', express.static(path.join(__dirname, 'public')));

// Agregar esto temporalmente a server.js
app.get('/api/init-database-once', async (req, res) => {
  try {
    // Ejecutar init-db.sql
    await pool.query(`
      DROP TABLE IF EXISTS asignaciones CASCADE;
      DROP TABLE IF EXISTS turnos CASCADE;
      DROP VIEW IF EXISTS vista_turnos CASCADE;

      CREATE TABLE turnos (
        id SERIAL PRIMARY KEY,
        dia TEXT NOT NULL,
        fecha DATE NOT NULL,
        hora TIME NOT NULL,
        sala TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE asignaciones (
        id SERIAL PRIMARY KEY,
        turno_id INTEGER REFERENCES turnos(id) ON DELETE CASCADE,
        puesto TEXT NOT NULL,
        nombre_usuario TEXT,
        disponible BOOLEAN DEFAULT TRUE,
        fecha_asignacion TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX idx_turnos_fecha ON turnos(fecha);
      CREATE INDEX idx_turnos_sala ON turnos(sala);
      CREATE INDEX idx_asignaciones_turno ON asignaciones(turno_id);
    `);

    await pool.query(`
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
      ORDER BY t.fecha, t.hora, t.sala
    `);

    res.json({ ok: true, mensaje: 'Base de datos inicializada correctamente' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Obtener todos los turnos con asignaciones
app.get('/api/turnos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM vista_turnos
      ORDER BY fecha, hora, sala
    `);
    res.json({ turnos: rows });
  } catch (err) {
    console.error('Error al obtener turnos:', err);
    res.status(500).json({ error: 'Error al obtener turnos' });
  }
});

// API: Asignar usuario a un puesto
app.post('/api/asignar', async (req, res) => {
  try {
    const { asignacion_id, nombre_usuario } = req.body;
    
    if (!asignacion_id || !nombre_usuario) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    // Verificar que el puesto está disponible y no ocupado
    const { rows: [asignacion] } = await pool.query(
      'SELECT * FROM asignaciones WHERE id = $1',
      [asignacion_id]
    );

    if (!asignacion) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    if (!asignacion.disponible) {
      return res.status(400).json({ error: 'Este puesto no está disponible' });
    }

    if (asignacion.nombre_usuario) {
      return res.status(400).json({ error: 'Este puesto ya está ocupado' });
    }

    // Asignar usuario
    await pool.query(
      'UPDATE asignaciones SET nombre_usuario = $1, fecha_asignacion = NOW() WHERE id = $2',
      [nombre_usuario, asignacion_id]
    );

    res.json({ ok: true, mensaje: 'Asignado correctamente' });
  } catch (err) {
    console.error('Error al asignar:', err);
    res.status(500).json({ error: 'Error al asignar' });
  }
});

// API: Desasignar usuario (solo admin)
app.post('/api/desasignar', async (req, res) => {
  try {
    const { asignacion_id, is_admin } = req.body;
    
    if (!is_admin) {
      return res.status(403).json({ error: 'Solo administradores pueden desasignar' });
    }

    await pool.query(
      'UPDATE asignaciones SET nombre_usuario = NULL WHERE id = $1',
      [asignacion_id]
    );

    res.json({ ok: true, mensaje: 'Desasignado correctamente' });
  } catch (err) {
    console.error('Error al desasignar:', err);
    res.status(500).json({ error: 'Error al desasignar' });
  }
});

// API: Importar CSV (solo admin)
app.post('/api/importar-csv', async (req, res) => {
  try {
    const { csv_data, is_admin } = req.body;
    
    if (!is_admin) {
      return res.status(403).json({ error: 'Solo administradores pueden importar' });
    }

    // Parsear CSV
    const lines = csv_data.trim().split('\n');
    const headers = lines[0].split(';');
    
    let importados = 0;
    let actualizados = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';');
      if (values.length < 8) continue;

      const [dia, fechaStr, hora, sala, titular, aux1, aux2, aux3] = values;
      
      // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD
      const [day, month, year] = fechaStr.split('/');
      const fecha = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      // Verificar si ya existe este turno
      const { rows: [existente] } = await pool.query(
        'SELECT id FROM turnos WHERE dia = $1 AND fecha = $2 AND hora = $3 AND sala = $4',
        [dia, fecha, hora]
      );

      let turno_id;
      
      if (existente) {
        turno_id = existente.id;
        actualizados++;
      } else {
        // Insertar nuevo turno
        const { rows: [nuevo] } = await pool.query(
          'INSERT INTO turnos (dia, fecha, hora, sala) VALUES ($1, $2, $3, $4) RETURNING id',
          [dia, fecha, hora, sala]
        );
        turno_id = nuevo.id;
        importados++;

        // Insertar asignaciones
        const puestos = [
          { nombre: 'Titular', valor: titular },
          { nombre: 'Auxiliar 1', valor: aux1 },
          { nombre: 'Auxiliar 2', valor: aux2 },
          { nombre: 'Auxiliar 3', valor: aux3 }
        ];

        for (const puesto of puestos) {
          const disponible = puesto.valor !== 'No disponible';
          const nombre = disponible && puesto.valor ? puesto.valor : null;
          
          await pool.query(
            'INSERT INTO asignaciones (turno_id, puesto, nombre_usuario, disponible) VALUES ($1, $2, $3, $4)',
            [turno_id, puesto.nombre, nombre, disponible]
          );
        }
      }
    }

    res.json({ 
      ok: true, 
      mensaje: `Importación completada. ${importados} nuevos turnos, ${actualizados} ya existían.` 
    });
  } catch (err) {
    console.error('Error al importar CSV:', err);
    res.status(500).json({ error: 'Error al importar: ' + err.message });
  }
});

// API: Descargar CSV actual
app.get('/api/exportar-csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM vista_turnos ORDER BY fecha, hora, sala
    `);

    let csv = 'Día;Fecha;Hora;Sala;Titular;Auxiliar 1;Auxiliar 2;Auxiliar 3\n';
    
    rows.forEach(r => {
      const fecha = new Date(r.fecha).toLocaleDateString('es-ES');
      const titular = !r.titular_disponible ? 'No disponible' : (r.titular || '');
      const aux1 = !r.aux1_disponible ? 'No disponible' : (r.auxiliar_1 || '');
      const aux2 = !r.aux2_disponible ? 'No disponible' : (r.auxiliar_2 || '');
      const aux3 = !r.aux3_disponible ? 'No disponible' : (r.auxiliar_3 || '');
      
      csv += `${r.dia};${fecha};${r.hora};${r.sala};${titular};${aux1};${aux2};${aux3}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=escala-ebi.csv');
    res.send('\ufeff' + csv); // BOM para Excel
  } catch (err) {
    console.error('Error al exportar:', err);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server listening on ${port}`));
