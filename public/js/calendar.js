// public/js/calendar.js
// Calendario: solo columnas Domingo, Lunes, Miércoles, Jueves, Viernes
// Reglas: Nombre + inicial del apellido; ignorar "No disponible"; "FALTA" para celdas vacías

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
  const calendar = {};
  let monthYear = {}; // { month: 'Noviembre', year: 2025, monthIndex: 10 }

  if (!Array.isArray(rows)) return { calendar, monthYear };

  for (const r of rows) {
    if (!r || !r.fecha || !r.hora || !r.sala) continue;

    // parse fecha (Postgres DATE -> ISO 'YYYY-MM-DD' esperado)
    let fechaObj = new Date(r.fecha);
    if (isNaN(fechaObj)) {
      // intentar DD/MM/YYYY
      const parts = String(r.fecha).split('/');
      if (parts.length === 3) {
        fechaObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
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
      calendar[dayNum] = { day: r.dia || fechaObj.toLocaleString('es-ES', { weekday: 'long' }), times: {} };
    }

    const timeKey = (r.hora || '').substring(0,5); // HH:MM
    if (!calendar[dayNum].times[timeKey]) calendar[dayNum].times[timeKey] = {};
    const room = r.sala;

    // Campos esperados por init-db.sql: titular, auxiliar_1, auxiliar_2, auxiliar_3
    const positions = [
      normalizeText(r.titular || ''),
      normalizeText(r.auxiliar_1 || ''),
      normalizeText(r.auxiliar_2 || ''),
      normalizeText(r.auxiliar_3 || '')
    ];

    const teachers = [];
    let emptyCount = 0;

    positions.forEach(posRaw => {
      // Ignorar "No disponible" (no cuenta como falta, no se muestra)
      if (isNoDisponible(posRaw)) {
        return;
      }
      // Si vacío -> FALTA
      if (!posRaw) {
        emptyCount++;
        return;
      }
      const formatted = formatName(posRaw);
      if (formatted) teachers.push(formatted);
      else emptyCount++;
    });

    calendar[dayNum].times[timeKey][room] = { teachers, emptyCount };
  }

  return { calendar, monthYear };
}

// mapping weekday -> column index in reduced grid (Domingo, Lunes, Miércoles, Jueves, Viernes)
// weekday: 0=Dom,1=Lun,2=Mar,3=Mié,4=Jue,5=Vie,6=Sáb
function weekdayToCol(weekday) {
  switch (weekday) {
    case 0: return 0; // Domingo -> col 0
    case 1: return 1; // Lunes -> col 1
    case 3: return 2; // Miércoles -> col 2
    case 4: return 3; // Jueves -> col 3
    case 5: return 4; // Viernes -> col 4
    default: return -1; // Martes(2) y Sábado(6) -> no mostramos
  }
}

// Construye las semanas del mes -> array de filas; cada fila es array de 5 celdas (número de día o null)
function buildWeeksForMonth(monthIndex, year) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weeks = [];
  let currentWeek = Array(5).fill(null);
  let lastCol = -1;

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthIndex, d);
    const wd = dt.getDay();
    // Ignorar martes(2) y sábado(6)
    if (wd === 2 || wd === 6) {
      continue;
    }
    const col = weekdayToCol(wd);
    if (col === -1) continue; // skip safety

    // Si el día actual se coloca en una columna menor o igual a la anterior, comenzamos nueva fila
    if (lastCol >= 0 && col <= lastCol) {
      weeks.push(currentWeek);
      currentWeek = Array(5).fill(null);
      lastCol = -1;
    }

    currentWeek[col] = d;
    lastCol = col;
  }

  // agregar la última semana si tiene algún contenido o para completitud
  weeks.push(currentWeek);
  return weeks;
}

function renderCalendar(calendarObj, monthYear) {
  const container = document.getElementById('calendar-container');
  if (!container) return;
  container.innerHTML = '';

  // Si no hay datos, mostrar por lo menos el calendario del mes (si monthYear existe)
  const monthIndex = (monthYear && typeof monthYear.monthIndex === 'number') ? monthYear.monthIndex : null;
  const year = (monthYear && monthYear.year) ? monthYear.year : null;

  // Si no hay monthYear ni datos, mostramos mensaje
  if ((!calendarObj || Object.keys(calendarObj).length === 0) && (monthIndex === null || year === null)) {
    container.innerHTML = '<div style="padding:24px;color:#666;font-weight:600;">No hay turnos cargados aún.</div>';
    return;
  }

  // Si monthYear existe, construir semanas del mes
  let weeks = [];
  if (monthIndex !== null && year !== null) {
    weeks = buildWeeksForMonth(monthIndex, year);
  } else {
    // Fallback: si no tenemos month info, construir a partir de claves disponibles
    const sortedDates = Object.keys(calendarObj).map(x=>parseInt(x)).sort((a,b)=>a-b);
    // Agrupar N por fila simple (no ideal, pero es fallback)
    const chunkSize = 5;
    for (let i=0;i<sortedDates.length;i+=chunkSize) {
      const week = Array(5).fill(null);
      const slice = sortedDates.slice(i,i+chunkSize);
      for (let j=0;j<slice.length;j++) week[j] = slice[j];
      weeks.push(week);
    }
  }

  // actualizar título si aplica
  if (monthYear && monthYear.month && monthYear.year) {
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = `📅 Calendario de Turnos - ${monthYear.month} ${monthYear.year}`;
  }

  const calendarDiv = document.createElement('div');
  calendarDiv.className = 'calendar-grid'; // ahora 5 columnas en CSS

  const dayHeaders = ['Domingo','Lunes','Miércoles','Jueves','Viernes'];
  dayHeaders.forEach(h => {
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = h;
    calendarDiv.appendChild(header);
  });

  // Renderizar cada semana como 5 celdas
  weeks.forEach(week => {
    for (let col = 0; col < 5; col++) {
      const dateNum = week[col];
      const dayCell = document.createElement('div');
      dayCell.className = 'day-cell';

      if (!dateNum) {
        // Celda vacía (por ejemplo, días del mes en martes/sábado o huecos)
        dayCell.innerHTML = '<div class="date-number"></div>';
        calendarDiv.appendChild(dayCell);
        continue;
      }

      const dateNumber = document.createElement('div');
      dateNumber.className = 'date-number';
      dateNumber.textContent = String(dateNum).padStart(2, '0');
      dayCell.appendChild(dateNumber);

      const schedule = document.createElement('div');
      schedule.className = 'schedule';

      // Si hay datos para el día, renderizarlos; si no, dejar vacío (pero el número de día aparece)
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

            if (roomData.teachers.length > 0) {
              const teacherSpan = document.createElement('span');
              teacherSpan.className = 'teacher';
              teacherSpan.textContent = roomData.teachers.join(', ');
              roomDiv.appendChild(teacherSpan);
            }

            // Mostrar una etiqueta FALTA por cada posición vacía
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
