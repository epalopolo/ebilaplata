positions.forEach(posRaw => {
  // Si es "No disponible", no mostrar nada y no contar como falta
  if (isNoDisponible(posRaw)) return;
  
  // Si está vacío (null, undefined o string vacío), contar como falta
  if (!posRaw) {
    emptyCount++;
    return;
  }
  
  // Si tiene un nombre válido, formatearlo y agregarlo
  const formatted = formatName(posRaw);
  if (formatted) {
    teachers.push(formatted);
  } else {
    // Si formatName devuelve null pero posRaw no estaba vacío, 
    // es porque era "No disponible" (ya manejado arriba) o formato inválido
    // No contar como falta en este caso
  }
});