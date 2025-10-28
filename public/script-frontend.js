let userName = localStorage.getItem('userName') || '';
let isAdmin = localStorage.getItem('isAdmin') === 'true';
let turnos = [];
let cambiosPendientes = new Set(); // Guardar IDs de asignaciones marcadas temporalmente
let asignacionesOriginales = new Map(); // Guardar estado original

document.getElementById('user-info').textContent = isAdmin ? '👑 Administrador' : `👤 ${userName}`;

if (isAdmin) {
  document.getElementById('admin-controls').style.display = 'flex';
}

// Cargar turnos
async function cargarTurnos() {
  try {
    const res = await fetch('/api/turnos');
    const data = await res.json();
    turnos = data.turnos;
    
    // Guardar estado original de asignaciones
    asignacionesOriginales.clear();
    turnos.forEach(turno => {
      if (turno.titular_id) asignacionesOriginales.set(turno.titular_id, turno.titular);
      if (turno.auxiliar_1_id) asignacionesOriginales.set(turno.auxiliar_1_id, turno.auxiliar_1);
      if (turno.auxiliar_2_id) asignacionesOriginales.set(turno.auxiliar_2_id, turno.auxiliar_2);
      if (turno.auxiliar_3_id) asignacionesOriginales.set(turno.auxiliar_3_id, turno.auxiliar_3);
    });
    
    renderizarTurnos();
    actualizarBotonGuardar();
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
    
    // Parsear fecha correctamente desde PostgreSQL
    let fechaFormateada = 'Fecha inválida';
    try {
      const fechaISO = turno.fecha.split('T')[0];
      const [year, month, day] = fechaISO.split('-');
      fechaFormateada = `${day}/${month}/${year}`;
    } catch (e) {
      console.error('Error al parsear fecha:', turno.fecha, e);
    }

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

  // Agregar event listeners para usuarios normales
  if (!isAdmin) {
    document.querySelectorAll('.puesto-btn.disponible, .puesto-btn.marcado-temp').forEach(btn => {
      btn.addEventListener('click', (e) => {
        toggleMarcado(e.target);
      });
    });
  }

  // Event listeners para admin (desasignar directamente)
  if (isAdmin) {
    document.querySelectorAll('.puesto-btn.ocupado').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const asignacionId = e.target.dataset.id;
        if (confirm('¿Desasignar este puesto?')) {
          await desasignarPuesto(asignacionId);
        }
      });
    });
  }
}

function crearPuesto(nombre, id, valor, disponible) {
  let clase = 'disponible';
  let texto = '✋ Anotarme';
  let clickable = true;

  // Verificar si está marcado temporalmente
  const marcadoTemp = cambiosPendientes.has(id);

  if (!disponible) {
    clase = 'no-disponible';
    texto = '🚫 No disponible';
    clickable = false;
  } else if (marcadoTemp) {
    // Marcado temporalmente (aún no guardado)
    clase = 'marcado-temp';
    texto = `⭐ ${userName}`;
    clickable = !isAdmin;
  } else if (valor) {
    // Ya ocupado en la base de datos
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

function toggleMarcado(button) {
  const asignacionId = parseInt(button.dataset.id);
  
  if (cambiosPendientes.has(asignacionId)) {
    // Desmarcar
    cambiosPendientes.delete(asignacionId);
  } else {
    // Marcar
    cambiosPendientes.add(asignacionId);
  }
  
  renderizarTurnos();
  actualizarBotonGuardar();
}

function actualizarBotonGuardar() {
  const btnGuardar = document.getElementById('btnGuardarCambios');
  const contador = document.getElementById('contador-cambios');
  const cantidad = cambiosPendientes.size;
  
  if (cantidad > 0) {
    contador.textContent = `(${cantidad})`;
    contador.style.display = 'inline';
  } else {
    contador.style.display = 'none';
  }
  
  // Habilitar botón solo si hay 3 o más cambios
  if (cantidad >= 3) {
    btnGuardar.disabled = false;
    btnGuardar.style.opacity = '1';
  } else {
    btnGuardar.disabled = true;
    btnGuardar.style.opacity = '0.5';
  }
}

async function guardarCambios() {
  if (cambiosPendientes.size < 3) {
    alert('⚠️ Debes marcar al menos 3 turnos antes de guardar');
    return;
  }

  if (!confirm(`¿Confirmar ${cambiosPendientes.size} asignaciones?`)) {
    return;
  }

  const btnGuardar = document.getElementById('btnGuardarCambios');
  btnGuardar.disabled = true;
  btnGuardar.textContent = '💾 Guardando...';

  try {
    // Enviar todas las asignaciones en lote
    const asignaciones = Array.from(cambiosPendientes);
    
    const res = await fetch('/api/asignar-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        asignaciones: asignaciones,
        nombre_usuario: userName 
      })
    });

    const data = await res.json();
    
    if (res.ok) {
      alert('✅ ' + data.mensaje);
      cambiosPendientes.clear();
      await cargarTurnos(); // Recargar desde el servidor
    } else {
      alert('❌ ' + data.error);
    }
  } catch (err) {
    console.error('Error:', err);
    alert('❌ Error al guardar los cambios');
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = '💾 Guardar Cambios';
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
    let csvData = event.target.result;
    
    csvData = csvData.replace(/D�a/g, 'Día');
    csvData = csvData.replace(/Mi�rcoles/g, 'Miércoles');
    
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

// Botón guardar cambios
document.getElementById('btnGuardarCambios').addEventListener('click', guardarCambios);

// Cerrar sesión
document.getElementById('btnLogout').addEventListener('click', () => {
  if (cambiosPendientes.size > 0) {
    if (!confirm('⚠️ Tienes cambios sin guardar. ¿Seguro que quieres salir?')) {
      return;
    }
  }
  localStorage.clear();
  window.location.href = '/';
});

// Cargar turnos al inicio
cargarTurnos();
