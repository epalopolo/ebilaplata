// Reglas:
// - Nombre + inicial apellido
// - Si disponible=false (No disponible): no mostrar nada, NO contar como falta
// - Si disponible=true y vacío: mostrar "FALTA" en rojo
// - Si disponible=true y tiene nombre: mostrar nombre formateado
// public/js/calendar.js
// Calendario completo con control de pausa para admin y descarga JPG

const POLL_INTERVAL_MS = 15000; // 15s

// Variables globales
let lastDataJson = null;
let pollTimer = null;
let isPaused = false;
let isAdmin = false;

// Función para normalizar texto
function normalizeText(s) {
  if (s === null || s === undefined) return '';
  return String(s).trim();
}

// Función para formatear nombres
function formatName(fullName) {
  const raw = normalizeText(fullName);
  if (!raw) return null;

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return `${firstName} ${lastName.charAt(0)}.`;
}

function processRows(rows) {
  const calendar = {};
  let monthYear = {}; // { month, year, monthIndex }

  if (!Array.isArray(rows)) return { calendar, monthYear };

  for (const r of rows) {
    if (!r || !r.fecha || !r.hora || !r.sala) continue;

    let fechaObj;
    const fechaStr = String(r.fecha).trim();
    
    if (fechaStr.includes('-')) {
      const parts = fechaStr.split('T')[0].split('-');
      fechaObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else if (fechaStr.includes('/')) {
      const parts = fechaStr.split('/');
      fechaObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else {
      fechaObj = new Date(r.fecha);
    }
    
    if (isNaN(fechaObj)) continue;

    const dayNum = fechaObj.getDate();
    const month = fechaObj.toLocaleString('es-ES', { month: 'long' });
    const year = fechaObj.getFullYear();
    const monthIndex = fechaObj.getMonth();

    if (!monthYear.month) {
      monthYear.month = month.charAt(0).toUpperCase() + month.slice(1);
      monthYear.year = year;
      monthYear.monthIndex = monthIndex;
    }

    if (!calendar[dayNum]) {
      const dayName = r.dia || fechaObj.toLocaleString('es-ES', { weekday: 'long' });
      calendar[dayNum] = { day: dayName, times: {} };
    }

    const timeKey = (r.hora || '').substring(0, 5);
    if (!calendar[dayNum].times[timeKey]) calendar[dayNum].times[timeKey] = {};
    const room = r.sala;

    // Array de posiciones con sus nombres y estado de disponibilidad
    const positions = [
      { name: r.titular || '', disponible: r.titular_disponible },
      { name: r.auxiliar_1 || '', disponible: r.aux1_disponible },
      { name: r.auxiliar_2 || '', disponible: r.aux2_disponible },
      { name: r.auxiliar_3 || '', disponible: r.aux3_disponible }
    ];

    const teachers = [];
    let emptyCount = 0;

    // LÓGICA: usar el campo disponible
    positions.forEach(pos => {
      const normalized = normalizeText(pos.name);
      
      // Si disponible es false, es "No disponible" → ignorar completamente
      if (pos.disponible === false) {
        return;
      }
      
      // Si disponible es true pero no hay nombre → FALTA
      if (pos.disponible === true && normalized === '') {
        emptyCount++;
        return;
      }
      
      // Si disponible es true y tiene nombre → mostrar nombre formateado
      if (pos.disponible === true && normalized !== '') {
        const formatted = formatName(normalized);
        if (formatted) {
          teachers.push(formatted);
        }
      }
    });

    calendar[dayNum].times[timeKey][room] = { teachers, emptyCount };
  }

  return { calendar, monthYear };
}

function buildWeeksForMonth(monthIndex, year) {
  const firstDay = new Date(year, monthIndex, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const totalCells = firstWeekday + daysInMonth;
  const weeksCount = Math.ceil(totalCells / 7);
  
  const weeks = Array.from({ length: weeksCount }, () => Array(7).fill(null));

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthIndex, d);
    const weekday = dt.getDay();
    
    const daysSinceStart = d - 1 + firstWeekday;
    const weekIndex = Math.floor(daysSinceStart / 7);
    
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

  if ((!calendarObj || Object.keys(calendarObj).length === 0) && (monthIndex === null || year === null)) {
    container.innerHTML = '<div style="padding:24px;color:#666;font-weight:600;">No hay turnos cargados aún.</div>';
    return;
  }

  let weeks = [];
  if (monthIndex !== null && year !== null) {
    weeks = buildWeeksForMonth(monthIndex, year);
  }

  if (monthYear && monthYear.month && monthYear.year) {
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = `📅 Calendario de Turnos - ${monthYear.month} ${monthYear.year}`;
  }

  const calendarDiv = document.createElement('div');
  calendarDiv.className = 'calendar-grid';

  const dayHeaders = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  dayHeaders.forEach(h => {
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = h;
    calendarDiv.appendChild(header);
  });

  weeks.forEach(week => {
    for (let col = 0; col < 7; col++) {
      const dateNum = week[col];
      const dayCell = document.createElement('div');
      dayCell.className = 'day-cell';

      if (!dateNum) {
        dayCell.classList.add('empty-cell');
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

// Función principal de actualización
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

// Iniciar polling automático
function startPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(fetchAndRender, POLL_INTERVAL_MS);
  updateUIStatus();
}

// Detener polling automático
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  updateUIStatus();
}

// Alternar pausa
function togglePause() {
  isPaused = !isPaused;
  localStorage.setItem('calendarPaused', isPaused ? 'true' : 'false');
  
  if (isPaused) {
    stopPolling();
  } else {
    startPolling();
  }
  
  updateUIStatus();
}

// Actualizar UI según el estado
function updateUIStatus() {
  const btnTogglePause = document.getElementById('btnTogglePause');
  const autoUpdateStatus = document.getElementById('auto-update-status');
  const updateInfo = document.getElementById('update-info');
  
  if (isPaused) {
    if (btnTogglePause) {
      btnTogglePause.textContent = '▶️ Reanudar actualizaciones';
      btnTogglePause.style.background = '#27ae60';
    }
    if (autoUpdateStatus) {
      autoUpdateStatus.textContent = '🔴 Actualizaciones automáticas pausadas';
      autoUpdateStatus.style.color = '#e74c3c';
    }
    if (updateInfo) {
      updateInfo.textContent = 'Actualizaciones automáticas pausadas por el administrador.';
    }
  } else {
    if (btnTogglePause) {
      btnTogglePause.textContent = '⏸️ Pausar actualizaciones';
      btnTogglePause.style.background = '#f39c12';
    }
    if (autoUpdateStatus) {
      autoUpdateStatus.textContent = '🟢 Actualizaciones automáticas activas';
      autoUpdateStatus.style.color = '#27ae60';
    }
    if (updateInfo) {
      updateInfo.textContent = 'Se actualiza automáticamente cada 15 segundos.';
    }
  }
}

// Función para descargar el calendario como JPG
async function downloadCalendarAsJPG() {
  const btnDownload = document.getElementById('btnDownloadJPG');
  const originalText = btnDownload.textContent;
  
  try {
    // Cambiar texto del botón
    btnDownload.textContent = '⏳ Generando imagen...';
    btnDownload.disabled = true;

    // Obtener el área a capturar
    const captureArea = document.getElementById('calendar-capture-area');
    
    if (!captureArea) {
      throw new Error('No se encontró el área del calendario');
    }

    // Generar el canvas con html2canvas
    const canvas = await html2canvas(captureArea, {
      backgroundColor: '#ffffff',
      scale: 2, // Mejor calidad
      logging: false,
      useCORS: true,
      allowTaint: true
    });

    // Convertir canvas a blob JPG
    canvas.toBlob((blob) => {
      // Crear URL temporal
      const url = URL.createObjectURL(blob);
      
      // Crear link de descarga
      const link = document.createElement('a');
      const h1Text = document.querySelector('h1').textContent;
      const fileName = `calendario-ebi-${new Date().toISOString().split('T')[0]}.jpg`;
      
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Liberar memoria
      URL.revokeObjectURL(url);
      
      // Restaurar botón
      btnDownload.textContent = originalText;
      btnDownload.disabled = false;
      
      // Mensaje de éxito
      alert('✅ Calendario descargado correctamente');
    }, 'image/jpeg', 0.95); // Calidad 95%

  } catch (err) {
    console.error('Error al descargar calendario:', err);
    alert('❌ Error al generar la imagen. Por favor, intenta nuevamente.');
    
    // Restaurar botón
    btnDownload.textContent = originalText;
    btnDownload.disabled = false;
  }
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  // Verificar si es admin
  isAdmin = localStorage.getItem('isAdmin') === 'true';
  
  // Mostrar controles de admin si corresponde
  if (isAdmin) {
    const btnTogglePause = document.getElementById('btnTogglePause');
    const autoUpdateStatus = document.getElementById('auto-update-status');
    
    if (btnTogglePause) btnTogglePause.style.display = 'inline-block';
    if (autoUpdateStatus) autoUpdateStatus.style.display = 'inline';
    
    // Restaurar estado de pausa
    const savedPauseState = localStorage.getItem('calendarPaused');
    isPaused = savedPauseState === 'true';
  }
  
  // Cargar datos inicialmente
  fetchAndRender();
  
  // Configurar botones
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', fetchAndRender);
  }
  
  const btnTogglePause = document.getElementById('btnTogglePause');
  if (btnTogglePause) {
    btnTogglePause.addEventListener('click', togglePause);
  }

  // Botón de descarga JPG (disponible para todos)
  const btnDownloadJPG = document.getElementById('btnDownloadJPG');
  if (btnDownloadJPG) {
    btnDownloadJPG.addEventListener('click', downloadCalendarAsJPG);
  }
  
  // Iniciar polling si no está pausado
  if (!isPaused) {
    startPolling();
  }
  
  updateUIStatus();
});
