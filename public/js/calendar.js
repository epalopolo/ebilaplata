// calendar.js
// Consulta /api/turnos, procesa los resultados y renderiza un calendario
// Respetando las reglas:
// - Nombre + inicial del apellido si hay nombre y apellido
// - No mostrar nada si dice "No disponible"
// - Mostrar "FALTA" (rojo) si la celda está vacía

const POLL_INTERVAL_MS = 15000; // 15s

function normalizeText(s) {
  if (s === null || s === undefined) return '';
  return String(s).trim();
}

function isNoDisponible(s) {
  if (!s) return false;
  return normalizeText(s).toLowerCase() === 'no disponible';
}

function formatName(fullName) {
  // Retorna: "Nombre A." si hay nombre y apellido
  // Si sólo hay un nombre devuelve ese nombre
  // Si es vacío o "No disponible" devuelve null
  const raw = normalizeText(fullName);
  if (!raw) return null;
  if (isNoDisponible(raw)) return null;

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return `${firstName} ${lastName.charAt(0)}.`;
}

function processRows(rows) {
  const calendar = {};
  let monthYear = {};

  rows.forEach(r => {
    if (!r || !r.fecha || !r.hora || !r.sala) return;

    let fechaObj = new Date(r.fecha);
    if (isNaN(fechaObj)) {
      const parts = String(r.fecha).split('/');
      if (parts.length === 3) {
        fechaObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    }
    if (isNaN(fechaObj)) return;

    const dayNum = fechaObj.getDate();
    const month = fechaObj.toLocaleString('es-ES', { month: 'long' });
    const year = fechaObj.getFullYear();
    if (!monthYear.month) {
      monthYear.month = month.charAt(0).toUpperCase() + month.slice(1);
      monthYear.year = year;
    }

    if (!calendar[dayNum]) {
      calendar[dayNum] = { day: r.dia || fechaObj.toLocaleString('es-ES', { weekday: 'long' }), times: {} };
    }

    const timeKey = (r.hora || '').substring(0,5);
    if (!calendar[dayNum].times[timeKey]) calendar[dayNum].times[timeKey] = {};
    const room = r.sala;

    const positions = [normalizeText(r.titular || ''), normalizeText(r.auxiliar_1 || ''), normalizeText(r.auxiliar_2 || ''), normalizeText(r.auxiliar_3 || '')];
    const disponibles = [r.titular_disponible, r.aux1_disponible, r.aux2_disponible, r.aux3_disponible];

    const teachers = [];
    let emptyCount = 0;

    positions.forEach((posRaw, idx) => {
      // Si el puesto no está disponible (disponible = false) -> ignorar completamente
      if (disponibles[idx] === false) {
        return;
      }
      
      // Si dice "No disponible" (por texto) -> ignorar
      if (isNoDisponible(posRaw)) {
        return;
      }

      if (!posRaw) {
        emptyCount++;
        return;
      }

      const formatted = formatName(posRaw);
      if (formatted) teachers.push(formatted);
      else emptyCount++;
    });

    calendar[dayNum].times[timeKey][room] = { teachers, emptyCount };
  });

  return { calendar, monthYear };
}

function renderCalendar(calendarObj, monthYear) {
  const container = document.getElementById('calendar-container');
  container.innerHTML = '';

  if (!calendarObj || Object.keys(calendarObj).length === 0) {
    container.innerHTML = '<div style="padding:24px;color:#666;font-weight:600;">No hay turnos cargados aún.</div>';
    return;
  }

  if (monthYear && monthYear.month && monthYear.year) {
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = `📅 Calendario de Turnos - ${monthYear.month} ${monthYear.year}`;
  }

  const calendarDiv = document.createElement('div');
  calendarDiv.className = 'calendar-grid';

  const dayHeaders = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  dayHeaders.forEach(h => {
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = h;
    calendarDiv.appendChild(header);
  });

  const sortedDates = Object.keys(calendarObj).sort((a,b)=>parseInt(a)-parseInt(b));
  sortedDates.forEach(dateNum => {
    const dayData = calendarObj[dateNum];
    const dayCell = document.createElement('div');
    dayCell.className = 'day-cell';

    const dateNumber = document.createElement('div');
    dateNumber.className = 'date-number';
    dateNumber.textContent = dateNum.toString().padStart(2,'0');
    dayCell.appendChild(dateNumber);

    const schedule = document.createElement('div');
    schedule.className = 'schedule';

    const sortedTimes = Object.keys(dayData.times).sort();
    sortedTimes.forEach(time => {
      const timeBlock = document.createElement('div');
      timeBlock.className = 'time-block';

      const timeDiv = document.createElement('div');
      timeDiv.className = 'time';
      timeDiv.textContent = time;
      timeBlock.appendChild(timeDiv);

      const rooms = dayData.times[time];
      Object.keys(rooms).forEach(roomName => {
        const roomData = rooms[roomName];
        const roomDiv = document.createElement('div');

        const roomLabel = document.createElement('span');
        roomLabel.className = 'room';
        roomLabel.textContent = roomName + ':';
        roomDiv.appendChild(roomLabel);
        roomDiv.appendChild(document.createTextNode(' '));

        if (roomData.teachers.length > 0) {
          const teacherSpan = document.createElement('span');
          teacherSpan.className = 'teacher';
          teacherSpan.textContent = roomData.teachers.join(', ');
          roomDiv.appendChild(teacherSpan);
        }

        // Mostrar FALTA para celdas vacías (en rojo). Si hay N vacíos, mostrar N etiquetas.
        for (let i = 0; i < roomData.emptyCount; i++) {
          roomDiv.appendChild(document.createTextNode(' '));
          const falta = document.createElement('span');
          falta.className = 'falta';
          falta.textContent = 'FALTA';
          roomDiv.appendChild(falta);
        }

        timeBlock.appendChild(roomDiv);
      });

      schedule.appendChild(timeBlock);
    });

    dayCell.appendChild(schedule);
    calendarDiv.appendChild(dayCell);
  });

  container.appendChild(calendarDiv);
}

let lastDataJson = null;
let pollTimer = null;

async function fetchAndRender() {
  try {
    const res = await fetch('/api/turnos', { cache: 'no-store' });
    if (!res.ok) throw new Error('Error al consultar /api/turnos');
    const data = await res.json();
    const rows = data.turnos || data; // por si el formato varía
    const { calendar, monthYear } = processRows(rows);

    const thisJson = JSON.stringify(rows);
    if (thisJson !== lastDataJson) {
      renderCalendar(calendar, monthYear);
      lastDataJson = thisJson;
    }

    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl) {
      lastUpdateEl.textContent = 'Última actualización: ' + new Date().toLocaleString('es-AR');
    }
  } catch (err) {
    console.error('Error al cargar turnos:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fetchAndRender();

  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', fetchAndRender);

  pollTimer = setInterval(fetchAndRender, POLL_INTERVAL_MS);
});
