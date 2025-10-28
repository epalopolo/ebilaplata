const API_ROOT = window.location.origin; // on Koyeb the same domain will serve
let userName = localStorage.getItem('userName') || '';
let isAdmin = localStorage.getItem('isAdmin') === 'true';
let edits = 0;

document.getElementById('user-info').textContent = isAdmin ? 'Administrador' : `Usuario: ${userName}`;
if (isAdmin) document.getElementById('btnDownload').style.display = 'inline-block';

async function fetchTable() {
  const res = await fetch('/api/table');
  const j = await res.json();
  render(j);
}
function render({ headers = [], table = [] }) {
  const container = document.getElementById('table-container');
  container.innerHTML = '';
  const tableEl = document.createElement('table');
  if (headers.length) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
    thead.appendChild(tr);
    tableEl.appendChild(thead);
  }
  const tbody = document.createElement('tbody');
  for (let r = 0; r < table.length; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < table[r].length; c++) {
      const td = document.createElement('td');
      td.textContent = table[r][c] || '';
      if (!td.textContent && !isAdmin) {
        td.classList.add('editable');
        td.addEventListener('click', () => {
          if (td.textContent) return;
          const nameShort = userName.split(' ')[0] + ' ' + (userName.split(' ')[1]?.[0] || '') + '.';
          td.textContent = nameShort;
          td.classList.remove('editable');
          td.classList.add('filled');
          edits++;
          if (edits >= 3) document.getElementById('btnSave').disabled = false;
        });
      } else if (td.textContent) {
        td.classList.add('locked');
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tableEl.appendChild(tbody);
  container.appendChild(tableEl);
}

document.getElementById('btnSave').addEventListener('click', async () => {
  const table = [...document.querySelectorAll('table tr')].map(tr => [...tr.children].map(td=>td.textContent));
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ data: table, user: userName })
    });
    if (res.ok) {
      alert('Guardado OK');
      edits = 0;
      document.getElementById('btnSave').disabled = true;
    } else throw new Error('save failed');
  } catch (err) {
    alert('Error al guardar');
    console.error(err);
  }
});

document.getElementById('btnDownload').addEventListener('click', () => {
  const rows = [...document.querySelectorAll('table tr')].map(tr => [...tr.children].map(td => `"${td.textContent.replace(/"/g,'""')}"`).join(','));
  const csv = rows.join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'escala.csv';
  a.click();
});

fetchTable();

