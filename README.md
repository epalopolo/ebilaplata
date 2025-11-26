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
- **Usuario Admin**: Contraseña `admin123` (acceder desde `/admin.html`)
- **Usuarios normales**: Sin contraseña, solo nombre (acceder desde `/`)

## Estructura de Rutas

| Ruta | Descripción |
|------|-------------|
| `/` | Página de inicio para usuarios normales (sin campo de contraseña) |
| `/admin.html` | Página de acceso para administradores (con campo de contraseña) |
| `/tabla.html` | Tabla de turnos (requiere login previo) |
| `/calendar.html` | Vista de calendario de turnos |

## API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/turnos` | GET | Obtener todos los turnos con asignaciones |
| `/api/mis-asignaciones` | GET | Obtener cantidad de asignaciones del usuario |
| `/api/asignar` | POST | Asignar usuario a un puesto |
| `/api/asignar-lote` | POST | Asignar múltiples puestos en lote |
| `/api/desasignar` | POST | Desasignar usuario (solo admin) |
| `/api/importar-csv` | POST | Importar turnos desde CSV (solo admin) |
| `/api/exportar-csv` | GET | Exportar turnos a CSV |
| `/api/limpiar-todo` | POST | Limpiar toda la base de datos (solo admin) |

## Funcionalidades

### Acceso Separado para Admin
- La ruta raíz (`/`) muestra el formulario de inscripción sin campo de contraseña
- El acceso de administrador está disponible en `/admin.html` con autenticación por contraseña
- Esto evita confusiones y mantiene la interfaz pública limpia

### Sugerencias de Nombres (Autocompletado)
El sistema guarda los nombres de usuarios en el navegador (localStorage) para ofrecer sugerencias:

- **Almacenamiento**: Cuando un usuario confirma una inscripción exitosamente, su nombre se guarda en localStorage
- **Normalización**: Los nombres se normalizan (minúsculas, sin tildes, sin espacios dobles) para evitar duplicados como "María García", "maria garcia", "MARIA GARCIA"
- **Autocompletado**: Al escribir en el campo de nombre, aparecen sugerencias de nombres previamente usados
- **Navegación**: Se puede navegar las sugerencias con las flechas del teclado (↑/↓) y seleccionar con Enter

**Nota técnica**: La implementación usa localStorage del navegador, por lo que las sugerencias son específicas por dispositivo/navegador. No se requiere backend adicional.

### Modal de Confirmación
Antes de guardar los turnos seleccionados, el sistema muestra un modal de confirmación con:

- **Título de advertencia**: "ATENCIÓN: estás anotándote para las siguientes escalas"
- **Tabla resumen**: Muestra Día, Fecha, Horario, Sala y Rol para cada turno seleccionado
- **Botón "Aceptar"**: Confirma y guarda los turnos definitivamente
- **Botón "Modificar"**: Cierra el modal sin guardar para permitir editar la selección

## Archivos Principales

```
public/
├── index.html          # Página de inicio (usuarios normales)
├── admin.html          # Página de administración
├── tabla.html          # Tabla de turnos
├── calendar.html       # Calendario de turnos
├── style.css           # Estilos CSS
├── script-frontend.js  # Lógica del frontend (tabla de turnos)
├── js/
│   ├── nameStore.js    # Utilidad para sugerencias de nombres
│   └── calendar.js     # Lógica del calendario
└── css/
    └── calendar.css    # Estilos del calendario
```
