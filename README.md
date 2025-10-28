# Escala EBI - Sistema de Turnos

Aplicación web para gestionar escalas de turnos con autenticación y base de datos PostgreSQL.

## Configuración en Koyeb

### 1. Variables de entorno necesarias
- `DATABASE_URL`: URL de conexión a PostgreSQL (formato: postgresql://user:pass@host:port/dbname)
- `PORT`: Se configura automáticamente en Koyeb (8080 por defecto)

### 2. Inicializar la base de datos
Ejecuta el script `init-db.sql` en tu base de datos PostgreSQL antes del primer despliegue.

### 3. Despliegue
- Dockerfile incluido para despliegue automático
- Puerto expuesto: 8080
- Comando de inicio: `node server.js`

## Credenciales
- **Usuario Admin**: Contraseña `admin123`
- **Usuarios normales**: Sin contraseña, solo nombre

## Estructura
- `/` - Página de login
- `/tabla.html` - Tabla de turnos
- `/api/table` - GET: Obtener datos
- `/api/save` - POST: Guardar cambios
