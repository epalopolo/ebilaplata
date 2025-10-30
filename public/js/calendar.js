// public/js/calendar.js
// Calendario completo: muestra todos los días de la semana (Domingo a Sábado)
// Reglas:
// - Nombre + inicial apellido
// - Ignorar "No disponible" (no mostrar nada)
// - Mostrar "FALTA" en rojo por cada posición vacía

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
  // Devuelve calendar: { [dayNum]: { day: 'Lunes', times: { '16:00': { sala: { teachers:[], emptyCount } } } } }
  // y monthYear con monthIndex para construir semanas correctamente.
  const calendar = {};
  let monthYear = {}; // { month, year, monthIndex }

  if (!Array.isArray(rows)) return { calendar, monthYear };

  for (const r of rows) {
    if (!r || !r.fecha || !r.hora || !r.sala) continue;

    // Parse fecha correctamente sin problemas de zona horaria
    let fechaObj;
    const fechaStr = String(r.fecha).trim();
    
    // Si viene en formato ISO (YYYY-MM-DD), parsearlo en hora local
    if (fechaStr.includes('-')) {
      const parts = fechaStr.split('T')[0].split('-'); // Tomar solo la parte de fecha
      fechaObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else if (fechaStr.includes('/')) {
      // Si viene en formato DD/MM/YYYY
      const parts = fechaStr.split('/');
      fechaObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else {
      fechaObj = new Date(r.fecha);
    }
    
    if (isNaN(fechaObj)) continue;

    const dayNum = fechaObj.getDate();
    const month = fechaObj.toLocaleString('es-ES', { month: 'long' });
    const year = fechaObj.getFullYear();
    const monthIndex = fechaObj.getMonth(); // 0-based

    if (!monthYear.month) {
      monthYear.month = month.charAt(0).toUpperCase() + month.slice(1);
      monthYear.year = year;
      monthYear.monthIndex = monthIndex;
    }

    if (!calendar[dayNum]) {
      // Usar el campo r.dia si viene, sino calcularlo
      const dayName = r.dia || fechaObj.toLocaleString('es-ES', { weekday: 'long' });
      calendar[dayNum] = { day: dayName, times: {} };
    }

    const timeKey = (r.hora || '').substring(0, 5); // HH:MM
    if (!calendar[dayNum].times[timeKey]) calendar[dayNum].times[timeKey] = {};
    const room = r.sala;

    // Campos esperados: titular, auxiliar_1, auxiliar_2, auxiliar_3
    const positions = [
      normalizeText(r.titular || ''),
      normalizeText(r.auxiliar_1 || ''),
      normalizeText(r.auxiliar_2 || ''),
      normalizeText(r.auxiliar_3 || '')
    ];

    const teachers = [];
    let emptyCount = 0;

    positions.forEach(posRaw => {
      if (isNoDisponible(posRaw)) return; // ignorar "No disponible"
      if (!posRaw) { emptyCount++; return; } // contar como falta
      const formatted = formatName(posRaw);
      if (formatted) teachers.push(formatted);
      else emptyCount++;
    });

    calendar[dayNum].times[timeKey][room] = { teachers, emptyCount };
  }

  return { calendar, monthYear };
}

// Construye la matriz de semanas del mes con todos los días (7 columnas)
function buildWeeksForMonth(monthIndex, year) {
  const firstDay = new Date(year, monthIndex, 1);
  const firstWeekday = firstDay.getDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // Calcular cuántas semanas necesitamos
  const totalCells = firstWeekday + daysInMonth;
  const weeksCount = Math.ceil(totalCells / 7);
  
  // Crear matriz de semanas (cada semana tiene 7 días)
  const weeks = Array.from({ length: weeksCount }, () => Array(7).fill(null));

  // Llenar los días del mes
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthIndex, d);
    const weekday = dt.getDay(); // 0=Domingo, 1=Lunes, etc.
    
    // Calcular en qué semana va este día
    const daysSinceStart = d - 1 + firstWeekday;
    const weekIndex = Math.floor(daysSinceStart / 7);
    
    // La columna es simplemente el día de la semana
    const col = weekday;
    
    weeks[weekIndex][col] = d;
  }

  return weeks;
}

function renderCalendar(calendarObj, monthYear) {
  const container = document.getElementById('calendar-container');
  if (!container) return;
  container.innerHTML = '';

  const monthIndex = (monthYear && typeof monthYear.monthIndex === 'number') ? monthYear.monthIndex : null;
  const year = (monthYear && monthYear.year) ? monthYear.year : null;

  // Si no hay datos y no detectamos month, mostramos mensaje
  if ((!calendarObj || Object.keys(calendarObj).length === 0) && (monthIndex === null || year === null)) {
    container.innerHTML = '<div style="padding:24px;color:#666;font-weight:600;">No hay turnos cargados aún.</div>';
    return;
  }

  // Construir semanas
  let weeks = [];
  if (monthIndex !== null && year !== null) {
    weeks = buildWeeksForMonth(monthIndex, year);
  }

  // Título
  if (monthYear && monthYear.month && monthYear.year) {
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = `📅 Calendario de Turnos - ${monthYear.month} ${monthYear.year}`;
  }

  const calendarDiv = document.createElement('div');
  calendarDiv.className = 'calendar-grid'; // CSS: 7 columnas

  // Headers de días de la semana
  const dayHeaders = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  dayHeaders.forEach(h => {
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = h;
    calendarDiv.appendChild(header);
  });

  // Recorrer semanas y renderizar 7 columnas por semana
  weeks.forEach(week => {
    for (let col = 0; col < 7; col++) {
      const dateNum = week[col];
      const dayCell = document.createElement('div');
      dayCell.className = 'day-cell';

      if (!dateNum) {
        // Celda vacía (días del mes anterior o siguiente)
        dayCell.classList.add('empty-cell');
        dayCell.innerHTML = '<div class="date-number"></div>';
        calendarDiv.appendChild(dayCell);
        continue;
      }

      // Mostrar número del día
      const dateNumber = document.createElement('div');
      dateNumber.className = 'date-number';
      dateNumber.textContent = String(dateNum).padStart(2, '0');
      dayCell.appendChild(dateNumber);

      const schedule = document.createElement('div');
      schedule.className = 'schedule';

      const dayData = calendarObj[dateNum];
      if (dayData && dayData.times) {
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

            // Mostrar nombres de educadoras
            if (roomData.teachers.length > 0) {
              const teacherSpan = document.createElement('span');
              teacherSpan.className = 'teacher';
              teacherSpan.textContent = roomData.teachers.join(', ');
              roomDiv.appendChild(teacherSpan);
            }

            // Mostrar "FALTA" por cada posición vacía
            for (let i = 0; i < roomData.emptyCount; i++) {
              if (roomData.teachers.length > 0 || i > 0) {
                roomDiv.appendChild(document.createTextNode(' '));
              }
              const falta = document.createElement('span');
              falta.className = 'falta';
              falta.textContent = 'FALTA';
              roomDiv.appendChild(falta);
            }

            timeBlock.appendChild(roomDiv);
          });

          schedule.appendChild(timeBlock);
        });
      }

      dayCell.appendChild(schedule);
      calendarDiv.appendChild(dayCell);
    }
  });

  container.appendChild(calendarDiv);
}

let lastDataJson = null;
let pollTimer = null;

async function fetchAndRender() {
  try {
    const res = await fetch('/api/turnos', { cache: 'no-store' });
    if (!res.ok) throw new Error('Error al consultar /api/turnos: ' + res.status);
    const data = await res.json();
    const rows = data.turnos || data;
    const { calendar, monthYear } = processRows(rows);

    const thisJson = JSON.stringify({ rows, monthYear });
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
    const container = document.getElementById('calendar-container');
    if (container) container.innerHTML = '<div style="padding:24px;color:#b00020;font-weight:700;">No se pudieron cargar los turnos. Revisá la consola.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fetchAndRender();
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', fetchAndRender);
  pollTimer = setInterval(fetchAndRender, POLL_INTERVAL_MS);
});