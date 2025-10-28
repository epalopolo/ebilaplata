let userName = localStorage.getItem('userName') || '';
let isAdmin = localStorage.getItem('isAdmin') === 'true';
let turnos = [];

document.getElementById('user-info').textContent = isAdmin ? '👑 Administrador' : `👤 ${userName}`;

if (isAdmin) {
  document.getElementById('admin-controls').style.display = 'flex';
}

// Limpiar base de datos
document.getElementById('btnLimpiar').addEventListener('click', async () => {
  if (!confirm('⚠️ ¿SEGURO que quieres eliminar TODOS los turnos?\nEsta acción no se puede deshacer.')) {
    return;
  }

  try {
    const res = await fetch('/api/limpiar-todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: isAdmin })
    });

    const data = await res.json();
    
    if (res.ok) {
      alert('✅ ' + data.mensaje);
      cargarTurnos();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al limpiar');
  }
});

// Cargar turnos
async function cargarTurnos() {
  try {
    const res = await fetch('/api/turnos');
    const data = await res.json();
    turnos = data.turnos;
    renderizarTurnos();
  } catch (err) {
    console.error('Error al cargar turnos:', err);
    alert('Error al cargar los turnos');
  }
}

function renderizarTurnos() {
  const container = document.getElementById('turnos-container');
  container.innerHTML = '';

  if (turnos.length === 0) {
    container.innerHTML = '<p class="no-data">No hay turnos disponibles. El administrador debe importar un CSV.</p>';
    return;
  }

  turnos.forEach(turno => {
    const card = document.createElement('div');
    card.className = 'turno-card';
    
    // CORRECCIÓN: Parsear fecha correctamente desde PostgreSQL
    let fechaFormateada = 'Fecha inválida';
    try {
      // PostgreSQL devuelve fechas en formato ISO: "2025-11-02T00:00:00.000Z"
      const fechaISO = turno.fecha.split('T')[0]; // "2025-11-02"
      const [year, month, day] = fechaISO.split('-');
      fechaFormateada = `${day}/${month}/${year}`;
    } catch (e) {
      console.error('Error al parsear fecha:', turno.fecha, e);
    }

    // Cortar hora a HH:MM (quitar segundos)
    const horaCorta = turno.hora ? turno.hora.substring(0, 5) : '00:00';

    card.innerHTML = `
      <div class="turno-header">
        <h3>📅 ${turno.dia} ${fechaFormateada}</h3>
        <div class="turno-info">
          <span>⏰ ${horaCorta}</span>
          <span>🏫 ${turno.sala}</span>
        </div>
      </div>
      <div class="turno-puestos">
        ${crearPuesto('Titular', turno.titular_id, turno.titular, turno.titular_disponible)}
        ${crearPuesto('Auxiliar 1', turno.auxiliar_1_id, turno.auxiliar_1, turno.aux1_disponible)}
        ${crearPuesto('Auxiliar 2', turno.auxiliar_2_id, turno.auxiliar_2, turno.aux2_disponible)}
        ${crearPuesto('Auxiliar 3', turno.auxiliar_3_id, turno.auxiliar_3, turno.aux3_disponible)}
      </div>
    `;
    
    container.appendChild(card);
  });

  // Agregar event listeners
  document.querySelectorAll('.puesto-btn.disponible').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const asignacionId = e.target.dataset.id;
      await asignarPuesto(asignacionId);
    });
  });

  document.querySelectorAll('.puesto-btn.ocupado').forEach(btn => {
    if (isAdmin) {
      btn.addEventListener('click', async (e) => {
        const asignacionId = e.target.dataset.id;
        if (confirm('¿Desasignar este puesto?')) {
          await desasignarPuesto(asignacionId);
        }
      });
    }
  });
}

function crearPuesto(nombre, id, valor, disponible) {
  let clase = 'disponible';
  let texto = '✋ Anotarme';
  let clickable = true;

  if (!disponible) {
    clase = 'no-disponible';
    texto = '🚫 No disponible';
    clickable = false;
  } else if (valor) {
    clase = 'ocupado';
    texto = `✅ ${valor}`;
    clickable = isAdmin;
  }

  return `
    <div class="puesto">
      <div class="puesto-nombre">${nombre}</div>
      <button class="puesto-btn ${clase}" 
              data-id="${id}" 
              ${!clickable ? 'disabled' : ''}>
        ${texto}
      </button>
    </div>
  `;
}

async function asignarPuesto(asignacionId) {
  if (!userName) {
    alert('Error: No se encontró tu nombre de usuario');
    return;
  }

  try {
    const res = await fetch('/api/asignar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asignacion_id: asignacionId, nombre_usuario: userName })
    });

    const data = await res.json();
    
    if (res.ok) {
      alert('✅ ' + data.mensaje);
      cargarTurnos();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al asignarse al puesto');
  }
}

async function desasignarPuesto(asignacionId) {
  try {
    const res = await fetch('/api/desasignar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asignacion_id: asignacionId, is_admin: isAdmin })
    });

    const data = await res.json();
    
    if (res.ok) {
      alert('✅ ' + data.mensaje);
      cargarTurnos();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al desasignar');
  }
}

// Importar CSV
document.getElementById('btnImportar').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const csvData = event.target.result;
    
    try {
      const res = await fetch('/api/importar-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvData, is_admin: isAdmin })
      });

      const data = await res.json();
      
      if (res.ok) {
        alert('✅ ' + data.mensaje);
        cargarTurnos();
      } else {
        alert('❌ ' + data.error);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Error al importar CSV');
    }
  };
  
  reader.readAsText(file, 'UTF-8');
});

// Exportar CSV
document.getElementById('btnExportar').addEventListener('click', () => {
  window.location.href = '/api/exportar-csv';
});

// Cerrar sesión
document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/';
});

// Cargar turnos al inicio
cargarTurnos();
