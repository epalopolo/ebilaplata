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

// API: Limpiar toda la base de datos (SOLO PARA ADMIN - USAR CON CUIDADO)
app.post('/api/limpiar-todo', async (req, res) => {
  try {
    const { is_admin } = req.body;
    
    if (!is_admin) {
      return res.status(403).json({ error: 'Solo administradores' });
    }

    await pool.query('TRUNCATE TABLE asignaciones CASCADE');
    await pool.query('TRUNCATE TABLE turnos CASCADE');

    res.json({ ok: true, mensaje: '✅ Base de datos limpiada correctamente' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Importar CSV (solo admin) - VERSIÓN CORREGIDA
app.post('/api/importar-csv', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { csv_data, is_admin } = req.body;
    
    if (!is_admin) {
      return res.status(403).json({ error: 'Solo administradores pueden importar' });
    }

    if (!csv_data) {
      return res.status(400).json({ error: 'No se recibió el archivo CSV' });
    }

    await client.query('BEGIN');

    // Parsear CSV
    const lines = csv_data.trim().split('\n');
    
    if (lines.length < 2) {
      throw new Error('El CSV está vacío o no tiene datos');
    }

    let importados = 0;
    let actualizados = 0;
    let errores = 0;

    // Procesar desde la línea 1 (saltar header)
    for (let i = 1; i < lines.length; i++) {
      try {
        // Limpiar la línea de caracteres extraños
        const linea = lines[i].replace(/\r/g, '').trim();
        if (!linea) continue;

        const values = linea.split(';');
        
        if (values.length < 8) {
          console.log(`Línea ${i} ignorada: formato incorrecto`);
          errores++;
          continue;
        }

        let [dia, fechaStr, hora, sala, titular, aux1, aux2, aux3] = values;
        
        // Limpiar valores
        dia = dia.trim();
        fechaStr = fechaStr.trim();
        hora = hora.trim();
        sala = sala.trim();
        titular = titular ? titular.trim() : '';
        aux1 = aux1 ? aux1.trim() : '';
        aux2 = aux2 ? aux2.trim() : '';
        aux3 = aux3 ? aux3.trim() : '';

        // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD
        const partesFecha = fechaStr.split('/');
        if (partesFecha.length !== 3) {
          console.log(`Línea ${i}: fecha inválida ${fechaStr}`);
          errores++;
          continue;
        }
        
        const [day, month, year] = partesFecha;
        const fecha = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

        // Validar hora (agregar segundos si no los tiene)
        if (!hora.includes(':')) {
          console.log(`Línea ${i}: hora inválida ${hora}`);
          errores++;
          continue;
        }
        
        const horaCompleta = hora.length === 5 ? `${hora}:00` : hora;

        // Verificar si ya existe este turno
        const { rows: existentes } = await client.query(
          'SELECT id FROM turnos WHERE dia = $1 AND fecha = $2 AND hora = $3 AND sala = $4',
          [dia, fecha, horaCompleta, sala]
        );

        let turno_id;
        
        if (existentes.length > 0) {
          // Ya existe, actualizar
          turno_id = existentes[0].id;
          actualizados++;
        } else {
          // Insertar nuevo turno
          const { rows: [nuevo] } = await client.query(
            'INSERT INTO turnos (dia, fecha, hora, sala) VALUES ($1, $2, $3, $4) RETURNING id',
            [dia, fecha, horaCompleta, sala]
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
            const nombre = (disponible && puesto.valor) ? puesto.valor : null;
            
            await client.query(
              'INSERT INTO asignaciones (turno_id, puesto, nombre_usuario, disponible) VALUES ($1, $2, $3, $4)',
              [turno_id, puesto.nombre, nombre, disponible]
            );
          }
        }
      } catch (lineError) {
        console.error(`Error en línea ${i}:`, lineError);
        errores++;
      }
    }

    await client.query('COMMIT');

    res.json({ 
      ok: true, 
      mensaje: `✅ Importación completada.\n${importados} turnos nuevos\n${actualizados} turnos ya existían\n${errores > 0 ? errores + ' errores ignorados' : ''}` 
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al importar CSV:', err);
    res.status(500).json({ 
      error: 'Error al importar CSV', 
      detalle: err.message 
    });
  } finally {
    client.release();
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
