// script.js
// Nota: asume que config.js y xlsx library ya están cargados.
const cfg = window.APP_CONFIG;
const landing = document.getElementById('landing');
const tableSection = document.getElementById('tableSection');
const inputName = document.getElementById('inputName');
const inputLast = document.getElementById('inputLast');
const btnStart = document.getElementById('btnStart');
const fileXLSX = document.getElementById('fileXLSX');
const tableWrap = document.getElementById('tableWrap');
const userLabel = document.getElementById('userLabel');
const btnSave = document.getElementById('btnSave');
const btnReload = document.getElementById('btnReload');
const btnAdmin = document.getElementById('btnAdmin');
const adminModal = document.getElementById('adminModal');
const adminPwd = document.getElementById('adminPwd');
const adminLogin = document.getElementById('adminLogin');
const adminCancel = document.getElementById('adminCancel');
const message = document.getElementById('message');

let workbookOriginal = null; // original workbook object
let tableData = []; // array of arrays for current state
let headers = [];
let lockedMap = {}; // keys like "r_c" true if locked
let newlyFilledCount = 0;
let userFirst = '', userLast = '';

function showMessage(txt, t='info') {
  message.classList.remove('hidden');
  message.textContent = txt;
  message.style.border = t==='error' ? '1px solid #fca5a5' : '1px solid #bbf7d0';
  setTimeout(()=> message.classList.add('hidden'), 4000);
}

async function fetchDefaultXLSX() {
  // try fetch xlsx from repo path
  try {
    const res = await fetch(cfg.XLSX_PATH);
    if (!res.ok) throw new Error('No hay xlsx en la ruta por defecto');
    const ab = await res.arrayBuffer();
    return ab;
  } catch (e) {
    console.warn('No se pudo cargar xlsx por defecto', e);
    return null;
  }
}

function readWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  return wb;
}

function workbookToTableData(wb) {
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return json;
}

function isDateString(s) {
  // simple detection iso or dd/mm/yyyy or dd-mm-yyyy
  if (!s) return false;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const alt = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
  return iso.test(s) || alt.test(s);
}

function renderTable(tableArr) {
  tableWrap.innerHTML = '';
  const table = document.createElement('table');
  // header row
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  const firstRow = tableArr[0] || [];
  firstRow.forEach((h, ci) => {
    const th = document.createElement('th');
    th.textContent = h || `Col ${ci+1}`;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (let r = 1; r < tableArr.length; r++) {
    const row = tableArr[r];
    const tr = document.createElement('tr');
    for (let c = 0; c < firstRow.length; c++) {
      const td = document.createElement('td');
      const val = (row && row[c] !== undefined) ? row[c] : '';
      td.textContent = val;
      const key = `${r}_${c}`;

      // If original cell had value (in workbookOriginal), lock it
      const originallyHad = workbookOriginalHasValue(r, c);
      if (originallyHad || (val && val.toString().trim() !== '')) {
        td.classList.add('locked');
        td.dataset.locked = '1';
        lockedMap[key] = true;
      } else {
        td.classList.add('editable');
        td.dataset.locked = '0';
      }

      // If value looks like a date, lock
      if (isDateString(val)) {
        td.classList.add('locked');
        td.dataset.locked = '1';
        lockedMap[key] = true;
      }

      // add click handler for editable cells
      td.addEventListener('click', (e)=>{
        if (td.dataset.locked === '1') return;
        // write user's name + initial
        const initial = userLast ? userLast.trim()[0].toUpperCase() + '.' : '';
        const nameStr = `${userFirst.trim()} ${initial}`.trim();
        td.textContent = nameStr;
        td.classList.remove('editable');
        td.classList.add('me');
        td.dataset.locked = '1';
        lockedMap[key] = true;

        // update tableData
        if (!tableArr[r]) tableArr[r] = [];
        tableArr[r][c] = nameStr;

        newlyFilledCount++;
        updateSaveState();
      });

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  updateSaveState();
}

function workbookOriginalHasValue(r, c) {
  // check sheet raw before editing: workbookOriginal stored as array
  if (!workbookOriginal) return false;
  const arr = workbookOriginalToArray(workbookOriginal);
  if (!arr[r]) return false;
  const v = arr[r][c];
  return (v !== undefined && v !== null && v.toString().trim() !== '');
}

function workbookOriginalToArray(wb) {
  // convert once to array of arrays
  if (!wb) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:false, defval: '' });
}

function updateSaveState() {
  // Count how many empty cells the current view still has
  // Save button enabled only if newlyFilledCount >= 3 (según requerimiento)
  if (newlyFilledCount >= 3) {
    btnSave.disabled = false;
  } else {
    btnSave.disabled = true;
  }
}

async function loadAndRender(arrayBuffer) {
  workbookOriginal = readWorkbook(arrayBuffer);
  tableData = workbookToTableData(workbookOriginal);
  // Headers are first row
  headers = tableData[0] || [];
  renderTable(tableData);
}

btnStart.addEventListener('click', async ()=>{
  const n = inputName.value.trim();
  const l = inputLast.value.trim();
  if (!n || !l) { showMessage('Completa nombre y apellido', 'error'); return; }
  userFirst = n; userLast = l;
  localStorage.setItem('escala_user', JSON.stringify({name:n, last:l}));
  userLabel.textContent = `${n} ${l}`;
  landing.classList.add('hidden');
  tableSection.classList.remove('hidden');

  // load default xlsx from cfg.XLSX_PATH or user uploaded file
  let ab = null;
  const file = fileXLSX.files[0];
  if (file) {
    ab = await file.arrayBuffer();
  } else {
    ab = await fetchDefaultXLSX();
    if (!ab) {
      showMessage('No se encontró el archivo xlsx en la ruta. Subilo manualmente o coloca el archivo en ' + cfg.XLSX_PATH, 'error');
      return;
    }
  }
  await loadAndRender(ab);
});

btnReload.addEventListener('click', async ()=>{
  // refetch xlsx from repo path
  const ab = await fetchDefaultXLSX();
  if (!ab) { showMessage('No se pudo recargar el xlsx por defecto', 'error'); return; }
  workbookOriginal = null; newlyFilledCount = 0; lockedMap = {};
  await loadAndRender(ab);
});

btnSave.addEventListener('click', async ()=>{
  // Prepare CSV from current tableData
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(tableData));
  // Ask GitHub API to update the repo at cfg.FILE_PATH
  showMessage('Guardando cambios en el repo...', 'info');

  try {
    await githubPutFile(cfg.FILE_PATH, csv, `Actualización escala: ${userFirst} ${userLast}`);
    showMessage('Cambios guardados correctamente.', 'info');
    btnSave.disabled = true;
    newlyFilledCount = 0;
    // After saving, lock all cells client-side too
    const tds = tableWrap.querySelectorAll('td.editable');
    tds.forEach(td => {
      td.dataset.locked = '1';
      td.classList.add('locked');
      td.classList.remove('editable');
    });
  } catch (e) {
    console.error(e);
    showMessage('Error guardando: ' + e.message, 'error');
  }
});

async function githubPutFile(path, contentString, commitMessage) {
  const token = cfg.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN no configurado en config.js');

  const apiRoot = 'https://api.github.com';
  const owner = cfg.REPO_OWNER;
  const repo = cfg.REPO_NAME;
  const getUrl = `${apiRoot}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

  // 1) get file to obtain sha (if exists)
  let sha = null;
  try {
    const resGet = await fetch(getUrl);
    if (resGet.ok) {
      const j = await resGet.json();
      sha = j.sha;
    }
  } catch (e) {
    // ignore; file might not exist
  }

  // 2) put (create/update) file
  const base64content = btoa(unescape(encodeURIComponent(contentString)));
  const body = {
    message: commitMessage || 'Actualización desde app',
    content: base64content,
    committer: {
      name: userFirst + ' ' + userLast,
      email: (userLast + '.' + userFirst + '@example.com').toLowerCase()
    }
  };
  if (sha) body.sha = sha;

  const res = await fetch(getUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const j = await res.json();
  if (!res.ok) {
    const msg = j && j.message ? j.message : 'error desconocido al subir archivo';
    throw new Error(msg);
  }
  return j;
}

// Admin flow: download CSV
btnAdmin.addEventListener('click', ()=>{
  adminModal.classList.remove('hidden');
});
adminCancel.addEventListener('click', ()=> adminModal.classList.add('hidden'));
adminLogin.addEventListener('click', async ()=>{
  const pw = adminPwd.value;
  if (pw !== cfg.ADMIN_PASSWORD) { showMessage('Contraseña incorrecta', 'error'); return; }
  adminModal.classList.add('hidden');
  // Fetch CSV either from repo path (cfg.FILE_PATH) or build from current table
  try {
    const csv = await fetchCSVfromRepoOrBuild();
    downloadString(csv, 'text/csv', 'escala_actualizada.csv');
    showMessage('CSV descargado', 'info');
  } catch (e) {
    showMessage('Error al obtener CSV: ' + e.message, 'error');
  }
});

async function fetchCSVfromRepoOrBuild() {
  // Try to fetch the saved CSV from repo; if not exist, build from current tableData
  const url = `https://raw.githubusercontent.com/${cfg.REPO_OWNER}/${cfg.REPO_NAME}/main/${cfg.FILE_PATH}`;
  try {
    const r = await fetch(url);
    if (r.ok) {
      return await r.text();
    } else {
      // build from tableData
      return XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(tableData));
    }
  } catch (e) {
    return XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(tableData));
  }
}

function downloadString(text, type, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// On start: restore user from localStorage
(function init() {
  const stored = localStorage.getItem('escala_user');
  if (stored) {
    try {
      const u = JSON.parse(stored);
      inputName.value = u.name || '';
      inputLast.value = u.last || '';
    } catch {}
  }
})();
