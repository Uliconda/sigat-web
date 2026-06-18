// src/pages/Inventory.jsx
import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, updateDoc, addDoc, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "../config/firebase"; 
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";

// Importamos librerías de reportes
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable"; 
import Swal from 'sweetalert2';

export default function Inventory() {
  const [equipos, setEquipos] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [reportType, setReportType] = useState("all"); 
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { userData } = useAuth();

  // ==========================================
  // 1. Cargar los equipos en tiempo real
  // ==========================================
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "Equipos"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setEquipos(data);
    });
    return () => unsubscribe();
  }, []);

  // FILTRADO DE EQUIPOS Y OCULTAMIENTO DE PLANTILLAS
  const filteredEquipos = equipos.filter((item) => {
    if (item.isTemplate || item.nombre === "Plantilla Sistema") return false;

    return (
      (item.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.id || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // ==========================================
  // 2. FUNCIÓN PARA CAMBIAR ESTADO NORMAL
  // ==========================================
  const handleToggleStatus = async (equipo) => {
    const esDisponible = equipo.estado?.toLowerCase() === "disponible";
    const nuevoEstado = esDisponible ? "Prestado" : "Disponible";

    const result = await Swal.fire({
      title: '¿Confirmar cambio?',
      text: `El equipo "${equipo.nombre}" pasará a estar ${nuevoEstado}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#28a745', 
      cancelButtonColor: '#d33',     
      confirmButtonText: 'Sí, cambiar estado',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return; 

    try {
      const equipoRef = doc(db, "Equipos", equipo.id);
      await updateDoc(equipoRef, {
        estado: nuevoEstado,
        usuarioActual: userData?.nombre || "Usuario Web", 
      });

      await addDoc(collection(db, "Historial"), {
        idEquipo: equipo.id,
        nombreEquipo: equipo.nombre,
        accion: nuevoEstado === "Prestado" ? "PRÉSTAMO" : "DEVOLUCIÓN",
        fecha: new Date(),
        admin: userData?.nombre || "Usuario Desconocido",
        observaciones: "Cambio de estado manual desde la Web",
      });

      Swal.fire({ title: '¡Actualizado!', text: `El equipo ahora está ${nuevoEstado}.`, icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error("Error al actualizar:", error);
      Swal.fire('Error', 'Hubo un problema de conexión al guardar el movimiento.', 'error');
    }
  };

  // ==========================================
  // 3. FUNCIÓN PARA DAR DE BAJA (Fuera de Servicio)
  // ==========================================
  const handleDiscardEquipment = async (equipo) => {
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: 'Dar de Baja Equipo',
      text: `¿Por qué vas a dar de baja el equipo "${equipo.nombre}"?`,
      input: 'text',
      inputPlaceholder: 'Ej. Pantalla rota, se quemó, extraviado...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, dar de baja',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value) return '¡Necesitas escribir un motivo para el historial!';
      }
    });

    if (!isConfirmed) return;

    try {
      const equipoRef = doc(db, "Equipos", equipo.id);
      await updateDoc(equipoRef, {
        estado: "Fuera de Servicio",
        usuarioActual: userData?.nombre || "Usuario Web", 
      });

      await addDoc(collection(db, "Historial"), {
        idEquipo: equipo.id,
        nombreEquipo: equipo.nombre,
        accion: "BAJA",
        fecha: new Date(),
        admin: userData?.nombre || "Usuario Web",
        observaciones: `Baja del sistema. Motivo: ${motivo}`,
      });

      Swal.fire({ title: '¡Equipo Dado de Baja!', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error("Error al dar de baja:", error);
      Swal.fire('Error', 'Hubo un problema al dar de baja el equipo.', 'error');
    }
  };

  // ==========================================
  // 4. FUNCIÓN PARA REACTIVAR EQUIPO (Reparado)
  // ==========================================
  const handleRestoreEquipment = async (equipo) => {
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: 'Reactivar Equipo',
      text: `¿Por qué se vuelve a activar el equipo "${equipo.nombre}"?`,
      input: 'text',
      inputPlaceholder: 'Ej. Se reparó, se cambió la pieza...',
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, reactivar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value) return '¡Necesitas escribir cómo o por qué se reparó!';
      }
    });

    if (!isConfirmed) return;

    try {
      const equipoRef = doc(db, "Equipos", equipo.id);
      await updateDoc(equipoRef, {
        estado: "Disponible",
        usuarioActual: userData?.nombre || "Usuario Web", 
      }); 
      
      await addDoc(collection(db, "Historial"), {
        idEquipo: equipo.id,
        nombreEquipo: equipo.nombre,
        accion: "REACTIVACIÓN",
        fecha: new Date(),
        admin: userData?.nombre || "Usuario Web",
        observaciones: `Equipo reactivado tras reparación. Motivo/Detalle: ${motivo}`,
      });

      Swal.fire({ title: '¡Equipo Reactivado!', text: 'El equipo ahora está Disponible nuevamente.', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error("Error al reactivar:", error);
      Swal.fire('Error', 'Hubo un problema al reactivar el equipo.', 'error');
    }
  };

  // ==========================================
  // 5. FUNCIÓN PARA GENERAR QR, DESCARGAR E IMPRIMIR
  // ==========================================
  const handleGenerateQR = async (equipo) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${equipo.id}`;

    const result = await Swal.fire({
      title: `QR del Equipo`,
      html: `<b>${equipo.nombre}</b><br/><small>ID: ${equipo.id}</small>`,
      imageUrl: qrUrl,
      imageWidth: 200,
      imageHeight: 200,
      imageAlt: `Código QR de ${equipo.id}`,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonColor: '#FF6F00',
      denyButtonColor: '#28a745', 
      cancelButtonColor: '#17a2b8', 
      confirmButtonText: 'Cerrar',
      denyButtonText: '📥 Descargar',
      cancelButtonText: '🖨️ Imprimir',
      footer: '<span style="color: gray; font-size: 13px;">Puedes escanear este código desde la App Móvil</span>'
    });

    if (result.isDenied) {
      try {
        const response = await fetch(qrUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `QR_${equipo.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error al descargar el QR:", error);
        window.open(qrUrl, '_blank');
      }
    } 
    else if (result.dismiss === Swal.DismissReason.cancel) {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Imprimir QR - ${equipo.nombre}</title>
            <style>
              body { text-align: center; font-family: Arial, sans-serif; margin-top: 50px; }
              img { margin-top: 20px; }
              @media print { @page { margin: 0; } body { margin: 1.6cm; } }
            </style>
          </head>
          <body>
            <h2>${equipo.nombre}</h2>
            <p><strong>ID:</strong> ${equipo.id}</p>
            <img src="${qrUrl}" width="250" height="250" alt="QR Code" />
            <script>
              window.onload = function() {
                setTimeout(() => { window.print(); window.close(); }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

// ==========================================
  // 6. EXPORTAR EL HISTORIAL (EXCEL) CON SUB-CATEGORÍAS Y SUB-SUBCATEGORÍAS
  // ==========================================
  const exportHistoryToExcel = async () => {
    try {
      const historialRef = collection(db, "Historial");
      let q;
      let nombreArchivo = `Reporte_SIGAT_Completo_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.xlsx`;

      if (reportType === "all") {
        q = query(historialRef, orderBy("fecha", "desc"));
      } else {
        if (!startDate || !endDate) {
          Swal.fire("Faltan datos", "Por favor selecciona la fecha de inicio y fin para generar el reporte.", "warning");
          return;
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0); 
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); 

        if (start > end) {
          Swal.fire("Error en las fechas", "La fecha de inicio no puede ser mayor a la fecha de fin.", "error");
          return;
        }

        q = query(historialRef, where("fecha", ">=", start), where("fecha", "<=", end), orderBy("fecha", "desc"));
        nombreArchivo = `Reporte_SIGAT_${startDate}_al_${endDate}.xlsx`;
      }

      Swal.fire({ title: 'Generando...', text: 'Obteniendo datos de la nube', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        Swal.fire("Sin datos", "No hay movimientos registrados en este rango de fechas.", "info");
        return;
      }

      const datosHistorial = snapshot.docs.map((doc) => {
        const data = doc.data();
        
        const fechaLegible = data.fecha 
          ? (typeof data.fecha.toDate === 'function' ? data.fecha.toDate().toLocaleString("es-MX") : new Date(data.fecha).toLocaleString("es-MX")) 
          : "Sin fecha";

        const equipoInfo = equipos.find(e => e.id === data.idEquipo);

        return {
          "Fecha y Hora": fechaLegible,
          "ID Equipo": data.idEquipo,
          "Nombre Equipo": data.nombreEquipo,
          "Categoría": equipoInfo?.categoria || "---",
          "Subcategoría": equipoInfo?.subcategoria || "---",          // 👈 Tu 2do nivel
          "Tipo (Sub-Sub)": equipoInfo?.subSubcategoria || "---",     // 👈 Tu 3er nivel (LAPTOPS y PC's)
          "Acción": data.accion,
          "Administrador": data.admin,
          "Observaciones": data.observaciones,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(datosHistorial);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Historial`);
      XLSX.writeFile(workbook, nombreArchivo);
      
      Swal.fire("¡Descarga lista!", "El archivo Excel se ha generado correctamente.", "success");

    } catch (error) {
      console.error("Error al generar Excel:", error);
      Swal.fire("Error", "Error al descargar el historial. Revisa la consola.", "error");
    }
  };

// ==========================================
  // 7. FUNCIÓN PARA EXPORTAR A PDF (CON SELECTOR DE LOS 3 NIVELES)
  // ==========================================
  const exportToPDF = async () => {
    const inputOptions = {
      "Todo": "Todo el inventario (Completo)"
    };
    
    // Construimos dinámicamente las opciones del menú basadas en los equipos reales
    equipos.forEach(item => {
      if (item.isTemplate || item.nombre?.toLowerCase() === "plantilla sistema") return;
      
      if (item.categoria) {
        // 1. Nivel Categoría (Este se queda igual para que puedas seleccionar la carpeta principal)
        if (!inputOptions[item.categoria]) {
          inputOptions[item.categoria] = `📁 Todo ${item.categoria}`;
        }
        
        // 2. Nivel Subcategoría (AQUÍ ESTÁ LA MAGIA: Ignoramos si dice "GENERAL")
        if (item.subcategoria && item.subcategoria.toUpperCase() !== "GENERAL") {
          const claveSub = `${item.categoria}|${item.subcategoria}`;
          if (!inputOptions[claveSub]) {
            inputOptions[claveSub] = `   ↳ Todo ${item.subcategoria}`;
          }
          
          // 3. Nivel Sub-Subcategoría (También ignoramos si dice "GENERAL")
          if (item.subSubcategoria && item.subSubcategoria.toUpperCase() !== "GENERAL") {
            const claveSubSub = `${item.categoria}|${item.subcategoria}|${item.subSubcategoria}`;
            if (!inputOptions[claveSubSub]) {
              inputOptions[claveSubSub] = `      - Solo ${item.subSubcategoria}`;
            }
          }
        }
      }
    });

    const { value: seleccion } = await Swal.fire({
      title: 'Generar PDF',
      text: '¿Qué información deseas incluir en el reporte?',
      icon: 'question',
      input: 'select',
      inputOptions: inputOptions,
      inputPlaceholder: 'Selecciona una opción',
      showCancelButton: true,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d32f2f',
      inputValidator: (value) => {
        if (!value) return 'Debes seleccionar una opción';
      }
    });

    if (!seleccion) return;

    let equiposAExportar = filteredEquipos;
    let tituloSecundario = "";

    if (seleccion !== "Todo") {
      const parts = seleccion.split("|");
      
      if (parts.length === 3) {
        // Eligió hasta la Sub-Subcategoría (Ej. ADMINISTRATIVOS > COBRANZA > LAPTOPS)
        equiposAExportar = filteredEquipos.filter(item => item.categoria === parts[0] && item.subcategoria === parts[1] && item.subSubcategoria === parts[2]);
        tituloSecundario = `${parts[0]} > ${parts[1]} > ${parts[2]}`;
      } 
      else if (parts.length === 2) {
        // Eligió hasta la Subcategoría (Ej. ADMINISTRATIVOS > COBRANZA)
        equiposAExportar = filteredEquipos.filter(item => item.categoria === parts[0] && item.subcategoria === parts[1]);
        tituloSecundario = `${parts[0]} > ${parts[1]}`;
      } 
      else {
        // Eligió la categoría principal completa
        equiposAExportar = filteredEquipos.filter(item => item.categoria === parts[0]);
        tituloSecundario = `${parts[0]} (Completo)`;
      }
    }

    if (equiposAExportar.length === 0) {
      Swal.fire("Sin datos", "No se encontraron equipos para esta selección.", "info");
      return;
    }

    const doc = new jsPDF("landscape"); // 👈 Lo cambié a horizontal para que quepan bien todas tus columnas
    
    const tituloPDF = seleccion === "Todo" 
      ? "Estado Actual del Inventario - SIGAT (Completo)"
      : `Reporte de Inventario - ${tituloSecundario}`;

    doc.text(tituloPDF, 14, 15);

// Ajustamos las columnas para incluir la descripción
    const tableColumn = ["ID", "Nombre / Modelo", "Categoría", "Sub.", "Sub-Sub", "Estado", "Usuario", "Descripción"]; // 👈 Se agregó Descripción al final
    
    const tableRows = equiposAExportar.map((item) => [
      item.id, 
      item.nombre, 
      item.categoria || "---", 
      item.subcategoria || "---", 
      item.subSubcategoria || "---", 
      item.estado, 
      item.usuarioActual || "---",
      item.descripcion || "---", // 👈 Aquí jalamos el campo descripción de tu base de datos
    ]);

    autoTable(doc, {
      head: [tableColumn], 
      body: tableRows, 
      startY: 20, 
      theme: "grid", 
      headStyles: { fillColor: "#ff6600", textColor: "#fff" },
      styles: { fontSize: 7.5, overflow: "linebreak" }, // 👈 Letra un pelín más chica y activamos salto de línea automático
      columnStyles: {
        7: { cellWidth: 50 } // 👈 A la columna 7 (Descripción) le damos un ancho fijo para que no aplaste al resto
      }
    });
    
    const nombreArchivo = seleccion === "Todo" 
      ? "Inventario_Completo_SIGAT.pdf" 
      : `Inventario_${seleccion.replace(/\|/g, '_').replace(/\s+/g, '')}_SIGAT.pdf`;
      
    doc.save(nombreArchivo);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--bg-color)", transition: "0.3s" }}>
      <Sidebar />

      <main style={{ marginLeft: "250px", flex: 1, padding: "40px" }}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Inventario y Reportes</h1>
            <p style={styles.subtitle}>Gestiona equipos y descarga la bitácora completa de movimientos</p>
          </div>

          <div style={styles.actions}>
            <div style={styles.exportGroup}>
              <select 
                value={reportType} 
                onChange={(e) => setReportType(e.target.value)}
                style={styles.selectFilter}
              >
                <option value="all" style={{ backgroundColor: "var(--card-bg)", color: "var(--text-color)" }}>Todo el historial</option>
                <option value="rango" style={{ backgroundColor: "var(--card-bg)", color: "var(--text-color)" }}>Elegir Fechas...</option>
              </select>

              {reportType === "rango" && (
                <div style={styles.datePickerContainer}>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.dateInput} />
                  <span style={{color: 'var(--text-color)', fontSize: '13px'}}>a</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.dateInput} />
                </div>
              )}

              <button onClick={exportHistoryToExcel} style={styles.btnExportExcel}>
                {reportType === "all" ? "📊 Descargar TODO" : "📊 Descargar Rango"}
              </button>
            </div>
            
            <button onClick={exportToPDF} style={styles.btnExportPdf}>📄 PDF Vista Actual</button>
          </div>
        </header>

        <div style={styles.searchContainer}>
          <span style={{ marginRight: "10px" }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre o ID..."
            style={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.theadRow}>
                <th style={styles.th}>ID EQUIPO</th>
                <th style={styles.th}>NOMBRE / MODELO</th>
                <th style={styles.th}>ESTADO</th>
                <th style={styles.th}>ÚLTIMO USUARIO</th>
                <th style={{ ...styles.th, textAlign: "center" }}>QR</th>
                <th style={{ ...styles.th, textAlign: "center" }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquipos.map((item) => (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}><b>{item.id}</b></td>
                  <td style={styles.td}>{item.nombre}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor: 
                          item.estado?.toLowerCase() === "disponible" ? "#e8f5e9" : 
                          (item.estado?.toLowerCase() === "prestado" || item.estado?.toLowerCase() === "sin entregar") ? "#ffebee" : 
                          item.estado?.toLowerCase() === "no responde" ? "#fce4ec" : "#eeeeee", 
                        color: 
                          item.estado?.toLowerCase() === "disponible" ? "#2e7d32" : 
                          (item.estado?.toLowerCase() === "prestado" || item.estado?.toLowerCase() === "sin entregar") ? "#c62828" : 
                          item.estado?.toLowerCase() === "no responde" ? "#ad1457" : "#616161", 
                      }}
                    >
                      {item.estado}
                    </span>
                  </td>
                  <td style={styles.td}>{item.usuarioActual || "---"}</td>
                  
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    <button onClick={() => handleGenerateQR(item)} style={styles.btnQr} title="Ver Código QR del equipo">🔳 QR</button>
                  </td>

                  <td style={{ ...styles.td, textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                    {item.estado !== "Fuera de Servicio" ? (
                      <>
                        <button onClick={() => handleToggleStatus(item)} style={styles.btnAction} title="Cambiar estado (Prestar/Devolver)">🔄 Estado</button>
                        <button onClick={() => handleDiscardEquipment(item)} style={{...styles.btnAction, backgroundColor: "#fff0f0", color: "#d32f2f", borderColor: "#ffcdd2"}} title="Marcar como descompuesto o fuera de servicio">🚫 Baja</button>
                      </>
                    ) : (
                      <button onClick={() => handleRestoreEquipment(item)} style={{...styles.btnAction, backgroundColor: "#e8f5e9", color: "#2e7d32", borderColor: "#c8e6c9"}} title="Volver a activar este equipo">✅ Reactivar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredEquipos.length === 0 && (
            <div style={styles.noResults}>No se encontraron equipos que coincidan.</div>
          )}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// ESTILOS
// ==========================================
const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "30px", flexWrap: "wrap", gap: "20px" },
  title: { margin: 0, fontSize: "28px", color: "var(--text-color)", transition: "0.3s" },
  subtitle: { margin: "5px 0 0 0", color: "var(--text-color)", opacity: 0.7, transition: "0.3s" },
  actions: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  exportGroup: { display: "flex", backgroundColor: "var(--card-bg)", borderRadius: "8px", border: "1px solid var(--border-color)", overflow: "hidden", transition: "0.3s" },
  selectFilter: { border: "none", padding: "12px 10px", outline: "none", backgroundColor: "transparent", color: "var(--text-color)", borderRight: "1px solid var(--border-color)", cursor: "pointer", fontSize: "14px" },
  datePickerContainer: { display: "flex", alignItems: "center", gap: "8px", padding: "0 10px", borderRight: "1px solid var(--border-color)", backgroundColor: "var(--bg-color)" },
  dateInput: { border: "1px solid var(--border-color)", borderRadius: "4px", padding: "5px", outline: "none", backgroundColor: "var(--card-bg)", color: "var(--text-color)", fontSize: "13px" },
  btnExportExcel: { backgroundColor: "#217346", color: "white", border: "none", padding: "12px 18px", cursor: "pointer", fontWeight: "600", transition: "0.2s" },
  btnExportPdf: { backgroundColor: "#d32f2f", color: "white", border: "none", padding: "12px 18px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", transition: "0.2s" },
  searchContainer: { backgroundColor: "var(--card-bg)", padding: "12px 20px", borderRadius: "12px", display: "flex", alignItems: "center", marginBottom: "25px", border: "1px solid var(--border-color)", transition: "0.3s" },
  searchInput: { border: "none", outline: "none", width: "100%", fontSize: "16px", backgroundColor: "transparent", color: "var(--text-color)" },
  tableCard: { backgroundColor: "var(--card-bg)", borderRadius: "15px", border: "1px solid var(--border-color)", overflow: "hidden", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", transition: "0.3s" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  theadRow: { backgroundColor: "var(--bg-color)", borderBottom: "2px solid var(--border-color)", transition: "0.3s" },
  th: { padding: "18px 20px", fontSize: "13px", color: "var(--text-color)", opacity: 0.7, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" },
  tr: { borderBottom: "1px solid var(--border-color)", transition: "0.2s" },
  td: { padding: "18px 20px", color: "var(--text-color)", fontSize: "15px" },
  statusBadge: { padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase" },
  btnAction: { backgroundColor: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold", transition: "0.3s" },
  btnQr: { backgroundColor: "#5E35B1", color: "white", border: "none", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" },
  noResults: { padding: "40px", textAlign: "center", color: "var(--text-color)", opacity: 0.6 },
};