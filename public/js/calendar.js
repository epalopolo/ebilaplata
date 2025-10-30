// calendar.js
// Consulta /api/turnos, procesa los resultados y renderiza un calendario
// similar al diseño provisto. Se actualiza automáticamente cada INTERVAL ms.

const POLL_INTERVAL_MS = 15000; // 15s

function formatName(fullName) {
  if (!fullName || fullName.trim() === '' || fullName.toLowerCase() === 'no disponible') return null;
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return `${firstName} ${lastName.charAt(0)}.`;
}

function processRows(rows) {
  // rows vienen de /api/turnos (server.js devuelve { turnos: rows })
  // cada row tiene: dia, fecha (ISO), hora (HH:MM:SS), sala, titular, auxiliar_1, auxiliar_2, auxiliar_3
  const calendar = {};
  let monthYear = {};

  rows.forEach(r => {
    if (!r.fecha || !r.hora || !r.sala) return;

    // fecha puede venir en ISO (YYYY-MM-DD). Obtener día, mes, año para título.
    const fecha = new Date(r.fecha);
    if (isNaN(fecha)) {
      // si no es ISO, intentar parseo simple
      const parts = (r.fecha || '').split('/');
      if (parts.length === 3) {
        fecha = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    }

    const dayNum = fecha.getDate();
    const month = fecha.toLocaleString('es-ES', { month: 'long' });
    const year = fecha.getFullYear();
    if (!monthYear.month) {
      monthYear.month = month.charAt(0).toUpperCase() + month.slice(1);
      monthYear.year = year;
    }

    if (!calendar[dayNum]) {
      calendar[dayNum] = { day: r.dia || fecha.toLocaleString('es-ES', { weekday: 'long' }), times: {} };
    }

    const timeKey = (r.hora || '').substring(0,5); // HH:MM
    if (!calendar[dayNum].times[timeKey]) calendar[dayNum].times[timeKey] = {};
    const room = r.sala;

    // posiciones según el esquema del backend
    const positions = [r.titular, r.auxiliar_1, r.auxiliar_2, r.auxiliar_3];
    const teachers = [];
    let emptyCount = 0;

    positions.forEach(pos => {
      const formatted = formatName(pos);
      if (formatted) teachers.push(formatted);
      else {
        // si viene 'No disponible' o null
        if (!pos || pos.trim() === '') emptyCount++;
        else if (pos.toLowerCase() === 'no disponible') {
          // No disponible -> mostrar como tal (no cuenta como falta)
        } else emptyCount++;
      }
    });

    calendar[dayNum].times[timeKey][room] = { teachers, emptyCount };
  });

  return { calendar, monthYear };
}

function renderCalendar(calendarObj, monthYear) {
  const container = document.getElementById('calendar-container');
  container.innerHTML = '';

  // actualizar título
  if (monthYear && monthYear.month && monthYear.year) {
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = `📅 Calendario de Turnos - ${monthYear.month} ${monthYear.year}`;
  }

  // grid: 5 columnas como en tu diseño original
  const calendarDiv = document.createElement('div');
  calendarDiv.className = 'calendar-grid';

  // headers (Lunes..Viernes) — uso simple: mostrar cabeceras fijas
  const dayHeaders = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  // si querés sólo 5 columnas, adaptá aquí; por ahora usamos el layout con los días reales
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
  // carga inicial
  fetchAndRender();

  // botón de actualizar manualmente
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', fetchAndRender);

  // polling automático
  pollTimer = setInterval(fetchAndRender, POLL_INTERVAL_MS);
});
