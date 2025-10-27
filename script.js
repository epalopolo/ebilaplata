// script.js
let userName = "";
let userInitial = "";
let isAdmin = false;
let minEdits = 3;
let editCount = 0;

// ====== INICIO DE SESIÓN DE USUARIO ======
function loginUser() {
  const nameInput = document.getElementById("name").value.trim();
  const passInput = document.getElementById("password")?.value.trim();

  if (nameInput.toLowerCase() === "admin" && passInput === "admin123") {
    localStorage.setItem("isAdmin", "true");
    window.location.href = "tabla.html";
    return;
  }

  if (!nameInput) {
    alert("Por favor ingresá tu nombre y apellido.");
    return;
  }

  localStorage.setItem("userName", nameInput);
  localStorage.setItem("isAdmin", "false");
  window.location.href = "tabla.html";
}

// ====== CARGA DE LA TABLA ======
async function loadTable() {
  userName = localStorage.getItem("userName") || "";
  isAdmin = localStorage.getItem("isAdmin") === "true";
  if (!userName && !isAdmin) {
    window.location.href = "index.html";
    return;
  }

  const tableContainer = document.getElementById("table-container");
  const saveButton = document.getElementById("save-button");
  const downloadButton = document.getElementById("download-button");

  if (isAdmin) {
    downloadButton.style.display = "block";
  }

  // Cargar el CSV generado del Excel (convertido y subido al repo)
  const response = await fetch("ebi_escala.csv");
  const csvText = await response.text();
  const rows = csvText.split("\n").map(r => r.split(","));

  const table = document.createElement("table");
  table.classList.add("styled-table");

  rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    row.forEach((cell, colIndex) => {
      const td = document.createElement(rowIndex === 0 ? "th" : "td");
      td.textContent = cell.trim();

      // Solo permite editar celdas vacías (que no sean encabezados)
      if (rowIndex !== 0 && cell.trim() === "") {
        td.classList.add("editable");
        td.addEventListener("click", () => handleCellClick(td));
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  tableContainer.appendChild(table);
}

// ====== EDICIÓN DE CELDAS ======
function handleCellClick(td) {
  if (td.textContent.trim() !== "") return; // Bloquear si ya está ocupada

  td.textContent = `${userName.split(" ")[0]} ${userName.split(" ")[1]?.[0] || ""}.`;
  td.classList.remove("editable");
  td.classList.add("filled");
  editCount++;

  if (editCount >= minEdits) {
    document.getElementById("save-button").disabled = false;
  }
}

// ====== GUARDAR CAMBIOS ======
function saveChanges() {
  const table = document.querySelector("table");
  const rows = [...table.querySelectorAll("tr")].map(tr =>
    [...tr.querySelectorAll("th,td")].map(td => td.textContent)
  );

  // Guardar localmente (en localStorage o n8n)
  localStorage.setItem("savedTable", JSON.stringify(rows));
  alert("Cambios guardados. En un entorno seguro, se enviarían al servidor.");

  document.getElementById("save-button").disabled = true;
}

// ====== DESCARGAR CSV (solo admin) ======
function downloadCSV() {
  const table = document.querySelector("table");
  const rows = [...table.querySelectorAll("tr")].map(tr =>
    [...tr.querySelectorAll("th,td")].map(td => td.textContent)
  );

  const csvContent = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "ebi_escala_actualizada.csv";
  link.click();
}
