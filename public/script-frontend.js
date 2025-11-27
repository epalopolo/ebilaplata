let userName = localStorage.getItem('userName') || '';
let isAdmin = localStorage.getItem('isAdmin') === 'true';
let turnos = [];
let cambiosPendientes = new Set(); // Guardar IDs de asignaciones marcadas temporalmente
let asignacionesOriginales = new Map(); // Guardar estado original
let asignacionesGuardadas = 0; // Cuántas asignaciones ya tiene el usuario en la BD

document.getElementById('user-info').textContent = isAdmin ? '👑 Administrador' : `👤 ${userName}`;

if (isAdmin) {
  document.getElementById('admin-controls').style.display = 'flex';
}

// Cargar cantidad de asignaciones guardadas del usuario
async function cargarAsignacionesUsuario() {
  if (isAdmin) {
    asignacionesGuardadas = 0;
    return;
  }

  try {
    const res = await fetch(`/api/mis-asignaciones?usuario=${encodeURIComponent(userName)}`);
    const data = await res.json();
    asignacionesGuardadas = data.total || 0;
    console.log(`Usuario tiene ${asignacionesGuardadas} asignaciones guardadas`);
  } catch (err) {
    console.error('Error al cargar asignaciones del usuario:', err);
    asignacionesGuardadas = 0;
  }
}

// Cargar turnos
async function cargarTurnos() {
  try {
    // Primero cargar cuántas asignaciones tiene el usuario
    await cargarAsignacionesUsuario();

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
    
    // Si es del usuario actual, resaltarlo
    if (!isAdmin && valor === userName) {
      clase = 'ocupado-propio';
      texto = `✅ ${valor} (Tú)`;
    }
    
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
  const cantidadPendiente = cambiosPendientes.size;
  const totalConPendientes = asignacionesGuardadas + cantidadPendiente;
  
  if (cantidadPendiente > 0) {
    contador.innerHTML = `<span class="pendientes">${cantidadPendiente}</span> + <span class="guardadas">${asignacionesGuardadas}</span> = <span class="total">${totalConPendientes}</span>`;
    contador.style.display = 'inline';
  } else if (asignacionesGuardadas > 0) {
    contador.innerHTML = `<span class="guardadas">${asignacionesGuardadas} guardadas</span>`;
    contador.style.display = 'inline';
  } else {
    contador.style.display = 'none';
  }
  
  // Calcular cuántas faltan para llegar a 3
  const faltantes = Math.max(0, 3 - totalConPendientes);
  
  // Actualizar texto del botón
  if (totalConPendientes >= 3) {
    btnGuardar.innerHTML = `💾 Guardar Cambios <span id="contador-cambios"></span>`;
    btnGuardar.disabled = cantidadPendiente === 0; // Solo habilitar si hay cambios pendientes
    btnGuardar.style.opacity = cantidadPendiente === 0 ? '0.5' : '1';
  } else {
    btnGuardar.innerHTML = `💾 Guardar Cambios <span id="contador-cambios"></span> <small style="display:block; font-size:11px; margin-top:3px;">Faltan ${faltantes} para completar 3</small>`;
    btnGuardar.disabled = true;
    btnGuardar.style.opacity = '0.5';
  }
  
  // Re-insertar el contador actualizado
  document.getElementById('contador-cambios').innerHTML = contador.innerHTML;
  document.getElementById('contador-cambios').style.display = contador.style.display;
}

async function guardarCambios() {
  const totalConPendientes = asignacionesGuardadas + cambiosPendientes.size;
  
  if (totalConPendientes < 3) {
    const faltantes = 3 - totalConPendientes;
    alert(`⚠️ Te faltan ${faltantes} turnos más para completar el mínimo de 3.\nActualmente tienes:\n- ${asignacionesGuardadas} ya guardados\n- ${cambiosPendientes.size} pendientes de guardar\n\nTotal: ${totalConPendientes}/3`);
    return;
  }

  if (cambiosPendientes.size === 0) {
    alert('⚠️ No hay cambios pendientes para guardar');
    return;
  }

  // Mostrar modal de confirmación en lugar de confirmar directamente
  mostrarModalConfirmacion();
}

// Función para mostrar el modal de confirmación
function mostrarModalConfirmacion() {
  const modal = document.getElementById('modal-confirmacion');
  const tbody = document.getElementById('modal-turnos-lista');
  
  // Construir la lista de turnos seleccionados
  const turnosSeleccionados = [];
  
  turnos.forEach(turno => {
    const roles = [
      { id: turno.titular_id, nombre: 'Titular' },
      { id: turno.auxiliar_1_id, nombre: 'Auxiliar 1' },
      { id: turno.auxiliar_2_id, nombre: 'Auxiliar 2' },
      { id: turno.auxiliar_3_id, nombre: 'Auxiliar 3' }
    ];
    
    roles.forEach(rol => {
      if (cambiosPendientes.has(rol.id)) {
        // Formatear la fecha
        let fechaFormateada = 'Fecha inválida';
        try {
          const fechaISO = turno.fecha.split('T')[0];
          const [year, month, day] = fechaISO.split('-');
          fechaFormateada = `${day}/${month}/${year}`;
        } catch (e) {
          console.error('Error al parsear fecha:', turno.fecha, e);
        }
        
        const horaCorta = turno.hora ? turno.hora.substring(0, 5) : '00:00';
        
        turnosSeleccionados.push({
          dia: turno.dia,
          fecha: fechaFormateada,
          hora: horaCorta,
          sala: turno.sala,
          rol: rol.nombre
        });
      }
    });
  });
  
  // Renderizar la tabla
  tbody.innerHTML = turnosSeleccionados.map(t => `
    <tr>
      <td>${t.dia}</td>
      <td>${t.fecha}</td>
      <td>${t.hora}</td>
      <td>${t.sala}</td>
      <td>${t.rol}</td>
      <td>${userName}</td>
    </tr>
  `).join('');
  
  // Mostrar el modal
  modal.classList.remove('hidden');
}

// Función para ocultar el modal
function ocultarModalConfirmacion() {
  const modal = document.getElementById('modal-confirmacion');
  modal.classList.add('hidden');
}

// Función para confirmar y guardar definitivamente
async function confirmarGuardado() {
  // Generar el PNG ANTES de ocultar el modal (mientras la tabla aún es visible)
  // Guardamos la promesa para descargar después de guardar exitosamente
  let pngDataUrl = null;
  let nombreArchivo = null;
  
  try {
    const tablaParaCaptura = document.getElementById('tabla-para-captura');
    
    if (tablaParaCaptura) {
      // Crear un contenedor temporal con estilos para la captura
      const contenedorTemporal = document.createElement('div');
      contenedorTemporal.style.position = 'absolute';
      contenedorTemporal.style.left = '-9999px';
      contenedorTemporal.style.top = '0';
      contenedorTemporal.style.background = 'white';
      contenedorTemporal.style.padding = '30px';
      contenedorTemporal.style.borderRadius = '15px';
      contenedorTemporal.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
      
      // Crear título
      const titulo = document.createElement('div');
      titulo.innerHTML = `
        <h2 style="color: #667eea; margin: 0 0 10px 0; font-size: 24px; text-align: center;">📅 Escala EBI</h2>
        <p style="color: #666; margin: 0 0 20px 0; text-align: center; font-size: 14px;">Turnos asignados a <strong>${userName}</strong></p>
      `;
      contenedorTemporal.appendChild(titulo);
      
      // Clonar la tabla
      const tablaClonada = tablaParaCaptura.cloneNode(true);
      tablaClonada.style.width = '100%';
      tablaClonada.style.borderCollapse = 'collapse';
      
      // Aplicar estilos inline a la tabla clonada para que se vean en la captura
      const thElements = tablaClonada.querySelectorAll('th');
      thElements.forEach(th => {
        th.style.background = '#667eea';
        th.style.color = 'white';
        th.style.padding = '12px 15px';
        th.style.textAlign = 'left';
        th.style.fontWeight = '600';
        th.style.fontSize = '13px';
        th.style.textTransform = 'uppercase';
      });
      
      const tdElements = tablaClonada.querySelectorAll('td');
      tdElements.forEach(td => {
        td.style.padding = '12px 15px';
        td.style.borderBottom = '1px solid #eee';
        td.style.fontSize = '14px';
        td.style.color = '#333';
      });
      
      contenedorTemporal.appendChild(tablaClonada);
      
      // Agregar pie de página con fecha de generación
      const fechaActual = new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const pie = document.createElement('p');
      pie.style.cssText = 'color: #999; font-size: 11px; margin-top: 20px; text-align: center;';
      pie.textContent = `Generado el ${fechaActual}`;
      contenedorTemporal.appendChild(pie);
      
      document.body.appendChild(contenedorTemporal);
      
      // Generar la imagen con html2canvas
      const canvas = await html2canvas(contenedorTemporal, {
        backgroundColor: '#ffffff',
        scale: 2, // Mayor resolución para mejor calidad
        logging: false,
        useCORS: true
      });
      
      // Limpiar el contenedor temporal
      document.body.removeChild(contenedorTemporal);
      
      // Preparar los datos del PNG para descarga posterior
      pngDataUrl = canvas.toDataURL('image/png');
      const fechaArchivo = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const nombreLimpio = userName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_');
      nombreArchivo = `escalas_${nombreLimpio}_${fechaArchivo}.png`;
    }
  } catch (error) {
    console.error('Error al preparar PNG (html2canvas):', error);
    // Continuamos con el guardado aunque falle la generación del PNG
  }
  
  // Ahora ocultamos el modal
  ocultarModalConfirmacion();

  const btnGuardar = document.getElementById('btnGuardarCambios');
  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.innerHTML;
  btnGuardar.innerHTML = '💾 Guardando...';

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
      // Guardar el nombre en localStorage para sugerencias futuras
      if (window.nameStore && userName) {
        window.nameStore.guardar(userName);
      }
      
      // Descargar el PNG después de guardar exitosamente
      if (pngDataUrl && nombreArchivo) {
        const link = document.createElement('a');
        link.download = nombreArchivo;
        link.href = pngDataUrl;
        link.click();
        console.log('PNG descargado correctamente:', nombreArchivo);
      }
      
      alert('✅ ' + data.mensaje);
      cambiosPendientes.clear();
      await cargarTurnos(); // Recargar desde el servidor
    } else {
      alert('❌ ' + data.error);
      btnGuardar.innerHTML = textoOriginal;
      btnGuardar.disabled = false;
      actualizarBotonGuardar();
    }
  } catch (err) {
    console.error('Error:', err);
    alert('❌ Error al guardar los cambios');
    btnGuardar.innerHTML = textoOriginal;
    btnGuardar.disabled = false;
    actualizarBotonGuardar();
  }
}

// Event listeners para los botones del modal (solo si existen)
const btnModalAceptar = document.getElementById('btnModalAceptar');
const btnModalModificar = document.getElementById('btnModalModificar');
if (btnModalAceptar) {
  btnModalAceptar.addEventListener('click', confirmarGuardado);
}
if (btnModalModificar) {
  btnModalModificar.addEventListener('click', ocultarModalConfirmacion);
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
