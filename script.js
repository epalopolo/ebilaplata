// ===== CONFIGURACIÓN =====
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbxeZx72JFji1QprbSZzhUR4FIuVpCOSPRZW6bIO07awPv0djk7-9azz0OFNeak2R8_2/exec"; // <-- tu URL de Apps Script
let userName = "";
let isAdmin = false;
let editedCells = new Set();

// ===== CARGA DE TABLA =====
async function loadTable() {
  userName = localStorage.getItem("userName") || "";
  isAdmin = localStorage.getItem("isAdmin") === "true";

  if (!userName && !isAdmin) {
    window.location.href = "index.html";
    return;
  }

  document.getElementById("user-info").textContent = isAdmin
    ? "Administrador"
    : `Usuario: ${userName}`;

  const saveButton = document.getElementById("save-button");
  const downloadButton = document.getElementById("download-button");
  if (isAdmin) downloadButton.style.display = "block";

  try {
    const response = await fetch(SHEETS_API_URL + "?t=" + Date.now());
    const rows = await response.json();
    renderTable(rows);
  } catch (err) {
    console.error("Error cargando la tabla:", err);
    alert("Error al cargar la tabla. Revisá la conexión o la URL del Script.");
  }
}

// ===== RENDERIZAR TABLA =====
function renderTable(rows) {
  const tableContainer = document.getElementById("table-container");
  tableContainer.innerHTML = "";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const headerRow = document.createElement("tr");
  rows[0].forEach(headerText => {
    const th = document.createElement("th");
    th.textContent = headerText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  for (let i = 1; i < rows.length; i++) {
    const tr = document.createElement("tr");
    rows[i].forEach(cellText => {
      const td = document.createElement("td");
      td.textContent = cellText;

      if (!cellText && !isAdmin) {
        td.classList.add("editable");
        td.addEventListener("click", () => handleCellClick(td));
      }

      if (cellText && !isAdmin) {
        td.classList.add("locked");
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  tableContainer.appendChild(table);
}

// ===== EDICIÓN =====
function handleCellClick(td) {
  if (td.textContent.trim() !== "") return;
  td.textContent = `${userName.split(" ")[0]} ${userName.split(" ")[1]?.charAt(0) || ""}.`;
  td.classList.remove("editable");
  td.classList.add("locked");
  editedCells.add(td);

  const saveButton = document.getElementById("save-button");
  if (editedCells.size >= 3) saveButton.disabled = false;
}

// ===== GUARDAR =====
async function saveChanges() {
  const table = document.querySelector("table");
  const rows = [...table.querySelectorAll("tr")].map(tr =>
    [...tr.querySelectorAll("th,td")].map(td => td.textContent)
  );

  try {
    const res = await fetch(SHEETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: rows }),
    });

    if (res.ok) {
      alert("Cambios guardados correctamente en Google Sheets.");
      editedCells.clear();
      document.getElementById("save-button").disabled = true;
    } else {
      alert("Error al guardar en Google Sheets.");
    }
  } catch (err) {
    console.error("Error al guardar:", err);
    alert("No se pudo guardar. Verificá conexión o permisos.");
  }
}

// ===== DESCARGAR CSV =====
function downloadCSV() {
  if (!isAdmin) return;
  const table = document.querySelector("table");
  const rows = [...table.querySelectorAll("tr")].map(tr =>
    [...tr.querySelectorAll("th,td")]
      .map(td => `"${td.textContent.replace(/"/g, '""')}"`)
      .join(",")
  );
  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "escala_actualizada.csv";
  link.click();
}

// ===== EVENTOS =====
document.addEventListener("DOMContentLoaded", () => {
  const saveButton = document.getElementById("save-button");
  const downloadButton = document.getElementById("download-button");

  if (saveButton) saveButton.addEventListener("click", saveChanges);
  if (downloadButton) downloadButton.addEventListener("click", downloadCSV);

  // Cargar tabla solo si estamos en tabla.html
  if (window.location.pathname.endsWith("tabla.html")) {
    loadTable();
  }
});
