// server.js
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors()); // el server controla CORS
app.use(bodyParser.json({ limit: '5mb' }));

// DATABASE_URL in Koyeb will be provided as env var
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // if Koyeb requires SSL config, add: ssl: { rejectUnauthorized: false }
});

// Serve static frontend
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

// API: obtener tabla (devuelve headers + filas)
app.get('/api/table', async (req, res) => {
  try {
    // Headers row
    const { rows: headersRows } = await pool.query(`SELECT * FROM meta ORDER BY id LIMIT 1`);
    const headers = headersRows[0] ? headersRows[0].headers : [];

    // Cells: fetch all cells ordered by row,col
    const { rows: cellRows } = await pool.query(`
      SELECT row_idx, col_idx, value, user_name, created_at
      FROM cells
      ORDER BY row_idx, col_idx
    `);

    // Convert cells to 2D array
    const maxRow = cellRows.reduce((m, r) => Math.max(m, r.row_idx), 0);
    const maxCol = cellRows.reduce((m, r) => Math.max(m, r.col_idx), 0);
    const table = [];

    // initialize with empty strings
    for (let r = 0; r <= maxRow; r++) {
      table[r] = Array(maxCol + 1).fill('');
    }

    cellRows.forEach(c => {
      table[c.row_idx][c.col_idx] = c.value;
    });

    // if we have headers, put them at row 0 (otherwise first row of table might be 0)
    if (headers.length) {
      res.json({ headers, table });
    } else {
      res.json({ headers: [], table });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// API: guardar tabla (recibe rows: array of arrays)
app.post('/api/save', async (req, res) => {
  try {
    const rows = req.body.data;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'invalid payload' });

    // headers in first row
    const headers = rows[0];

    // save headers into meta (overwrite single row)
    await pool.query(`DELETE FROM meta`);
    await pool.query(`INSERT INTO meta(headers) VALUES ($1)`, [headers]);

    // clean existing cells and insert new
    await pool.query(`TRUNCATE TABLE cells`);

    const insertText = `INSERT INTO cells(row_idx, col_idx, value, user_name, created_at) VALUES ($1,$2,$3,$4,NOW())`;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const val = rows[r][c] || '';
        // skip completely empty
        await pool.query(insertText, [r, c, val, req.body.user || null]);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'save error' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server listening on ${port}`));

