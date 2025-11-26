/**
 * Utilidad para almacenar y recuperar nombres de usuarios en localStorage
 * con normalización para evitar duplicados (mayúsculas/minúsculas, tildes, espacios)
 */

const NAME_STORAGE_KEY = 'ebi_nombres_guardados';

/**
 * Normaliza un nombre para comparación:
 * - Convierte a minúsculas
 * - Elimina tildes
 * - Elimina espacios dobles y espacios al inicio/final
 */
function normalizarNombre(nombre) {
  if (!nombre) return '';
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes
    .replace(/\s+/g, ' ')            // Convertir múltiples espacios en uno
    .trim();
}

/**
 * Obtiene todos los nombres guardados
 * @returns {Array<{nombre: string, normalizado: string}>}
 */
function obtenerNombres() {
  try {
    const data = localStorage.getItem(NAME_STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    console.error('Error al leer nombres guardados:', e);
    return [];
  }
}

/**
 * Guarda un nombre si no existe uno equivalente (normalizado)
 * @param {string} nombre - El nombre a guardar en su forma canónica
 * @returns {boolean} - true si se guardó, false si ya existía
 */
function guardarNombre(nombre) {
  if (!nombre || nombre.trim() === '') return false;
  
  const nombreLimpio = nombre.trim();
  const normalizado = normalizarNombre(nombreLimpio);
  
  const nombres = obtenerNombres();
  
  // Verificar si ya existe un nombre con la misma normalización
  const existe = nombres.some(n => n.normalizado === normalizado);
  
  if (!existe) {
    nombres.push({
      nombre: nombreLimpio,
      normalizado: normalizado
    });
    
    try {
      localStorage.setItem(NAME_STORAGE_KEY, JSON.stringify(nombres));
      return true;
    } catch (e) {
      console.error('Error al guardar nombre:', e);
      return false;
    }
  }
  
  return false;
}

/**
 * Busca nombres que coincidan con el texto ingresado
 * @param {string} texto - Texto a buscar
 * @returns {Array<string>} - Lista de nombres canónicos que coinciden
 */
function buscarNombres(texto) {
  if (!texto) return [];
  
  const textoNormalizado = normalizarNombre(texto);
  const nombres = obtenerNombres();
  
  return nombres
    .filter(n => n.normalizado.includes(textoNormalizado))
    .map(n => n.nombre);
}

/**
 * Obtiene todos los nombres canónicos guardados
 * @returns {Array<string>}
 */
function obtenerTodosLosNombres() {
  return obtenerNombres().map(n => n.nombre);
}

// Exportar funciones para uso global
window.nameStore = {
  normalizar: normalizarNombre,
  guardar: guardarNombre,
  buscar: buscarNombres,
  obtenerTodos: obtenerTodosLosNombres
};
