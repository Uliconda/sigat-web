// src/pages/Inventory.jsx
import { useState, useEffect } from "react";
// Importamos "where" para poder filtrar por fechas
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
const [timeFilter, setTimeFilter] = useState("all"); 
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

const filteredEquipos = equipos.filter((item) =>
(item.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
(item.id || "").toLowerCase().includes(searchTerm.toLowerCase())
);

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

    Swal.fire({
    title: '¡Actualizado!',
    text: `El equipo ahora está ${nuevoEstado}.`,
    icon: 'success',
    timer: 2000, 
    showConfirmButton: false
    });

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
// 5. NUEVO: FUNCIÓN PARA GENERAR QR EN PANTALLA
// ==========================================
const handleGenerateQR = (equipo) => {
// Usamos una API gratuita y rápida para generar el QR basado en el ID del equipo
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${equipo.id}`;

Swal.fire({
    title: `QR del Equipo`,
    html: `<b>${equipo.nombre}</b><br/><small>ID: ${equipo.id}</small>`,
    imageUrl: qrUrl,
    imageWidth: 200,
    imageHeight: 200,
    imageAlt: `Código QR de ${equipo.id}`,
    confirmButtonColor: '#FF6F00',
    confirmButtonText: 'Cerrar',
    footer: '<span style="color: gray; font-size: 13px;">Puedes escanear este código desde la App Móvil</span>'
});
};

// ==========================================
// 6. EXPORTAR EL HISTORIAL CON FILTRO DE FECHA
// ==========================================
const exportHistoryToExcel = async () => {
try {
    const historialRef = collection(db, "Historial");
    let q;

    if (timeFilter === "all") {
    q = query(historialRef, orderBy("fecha", "desc"));
    } else {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - parseInt(timeFilter));
    
    q = query(
        historialRef, 
        where("fecha", ">=", limitDate), 
        orderBy("fecha", "desc")
    );
    }

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
    Swal.fire("Sin datos", "No hay movimientos en este rango de fechas.", "info");
    return;
    }

    const datosHistorial = snapshot.docs.map((doc) => {
    const data = doc.data();
    const fechaLegible = data.fecha ? data.fecha.toDate().toLocaleString("es-MX") : "Sin fecha";

    return {
        "Fecha y Hora": fechaLegible,
        "ID Equipo": data.idEquipo,
        "Nombre Equipo": data.nombreEquipo,
        "Acción": data.accion,
        "Administrador": data.admin,
        "Observaciones": data.observaciones,
    };
    });

    const worksheet = XLSX.utils.json_to_sheet(datosHistorial);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Historial_${timeFilter}dias`);
    XLSX.writeFile(workbook, `Reporte_SIGAT_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.xlsx`);
    
    Swal.fire("¡Descarga lista!", "El archivo Excel se ha generado correctamente.", "success");

} catch (error) {
    console.error("Error al generar Excel:", error);
    if (error.message.includes("index")) {
    Swal.fire({ title: "Falta un Índice en Firebase", text: "Ve a la consola de desarrollador para ver el enlace y crear el índice. Tarda un par de minutos en habilitarse.", icon: "warning" });
    } else {
    Swal.fire("Error", "Error al descargar el historial. Revisa la consola.", "error");
    }
}
};

// ==========================================
// 7. FUNCIÓN PARA EXPORTAR LA VISTA ACTUAL A PDF
// ==========================================
const exportToPDF = () => {
const doc = new jsPDF();
doc.text("Estado Actual del Inventario - SIGAT", 14, 15);

const tableColumn = ["ID", "Nombre", "Estado", "Usuario"];
const tableRows = filteredEquipos.map((item) => [
    item.id, item.nombre, item.estado, item.usuarioActual || "---",
]);

autoTable(doc, {
    head: [tableColumn], body: tableRows, startY: 20, theme: "grid", headStyles: { fillColor: [255, 102, 0] },
});
doc.save("Inventario_Actual_SIGAT.pdf");
};

return (
<div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
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
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
            style={styles.selectFilter}
            >
            <option value="all">Todo el historial</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            </select>
            <button onClick={exportHistoryToExcel} style={styles.btnExportExcel}>
            📊 Descargar Historial
            </button>
        </div>
        
        <button onClick={exportToPDF} style={styles.btnExportPdf}>
            📄 PDF Vista Actual
        </button>
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
            {/* --- NUEVA COLUMNA DE QR --- */}
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
                        item.estado?.toLowerCase() === "prestado" ? "#ffebee" : "#eeeeee",
                    color: 
                        item.estado?.toLowerCase() === "disponible" ? "#2e7d32" : 
                        item.estado?.toLowerCase() === "prestado" ? "#c62828" : "#616161",
                    }}
                >
                    {item.estado}
                </span>
                </td>
                <td style={styles.td}>{item.usuarioActual || "---"}</td>
                
                {/* --- NUEVO BOTÓN DE QR EN LA TABLA --- */}
                <td style={{ ...styles.td, textAlign: "center" }}>
                <button
                    onClick={() => handleGenerateQR(item)}
                    style={styles.btnQr}
                    title="Ver Código QR del equipo"
                >
                    🔳 QR
                </button>
                </td>

                {/* AQUÍ ESTÁ LA MAGIA CONDICIONAL DE LOS BOTONES DE ACCIONES */}
                <td style={{ ...styles.td, textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                
                {item.estado !== "Fuera de Servicio" ? (
                    <>
                    <button
                        onClick={() => handleToggleStatus(item)}
                        style={styles.btnAction}
                        title="Cambiar estado (Prestar/Devolver)"
                    >
                        🔄 Estado
                    </button>

                    <button
                        onClick={() => handleDiscardEquipment(item)}
                        style={{...styles.btnAction, backgroundColor: "#fff0f0", color: "#d32f2f", borderColor: "#ffcdd2"}}
                        title="Marcar como descompuesto o fuera de servicio"
                    >
                        🚫 Baja
                    </button>
                    </>
                ) : (
                    <button
                    onClick={() => handleRestoreEquipment(item)}
                    style={{...styles.btnAction, backgroundColor: "#e8f5e9", color: "#2e7d32", borderColor: "#c8e6c9"}}
                    title="Volver a activar este equipo (Ej. Se reparó)"
                    >
                    ✅ Reactivar
                    </button>
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
header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "30px" },
title: { margin: 0, fontSize: "28px", color: "#1a1a1a" },
subtitle: { margin: "5px 0 0 0", color: "#666" },
actions: { display: "flex", gap: "10px", alignItems: "center" },
exportGroup: { display: "flex", backgroundColor: "#fff", borderRadius: "8px", border: "1px solid #ccc", overflow: "hidden" },
selectFilter: { border: "none", padding: "0 10px", outline: "none", backgroundColor: "#f9f9f9", color: "#333", borderRight: "1px solid #ddd", cursor: "pointer", fontSize: "14px" },
btnExportExcel: { backgroundColor: "#217346", color: "white", border: "none", padding: "12px 18px", cursor: "pointer", fontWeight: "600", transition: "0.2s" },
btnExportPdf: { backgroundColor: "#d32f2f", color: "white", border: "none", padding: "12px 18px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", transition: "0.2s" },
searchContainer: { backgroundColor: "#fff", padding: "12px 20px", borderRadius: "12px", display: "flex", alignItems: "center", marginBottom: "25px", border: "1px solid #e0e0e0" },
searchInput: { border: "none", outline: "none", width: "100%", fontSize: "16px" },
tableCard: { backgroundColor: "#fff", borderRadius: "15px", border: "1px solid #e0e0e0", overflow: "hidden", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" },
table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
theadRow: { backgroundColor: "#fcfcfc", borderBottom: "2px solid #f0f0f0" },
th: { padding: "18px 20px", fontSize: "13px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" },
tr: { borderBottom: "1px solid #f0f0f0", transition: "0.2s" },
td: { padding: "18px 20px", color: "#444", fontSize: "15px" },
statusBadge: { padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase" },
btnAction: { backgroundColor: "#f0f0f0", color: "#333", border: "1px solid #ddd", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" },
// NUEVO ESTILO PARA EL BOTÓN DE QR
btnQr: { backgroundColor: "#5E35B1", color: "white", border: "none", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" },
noResults: { padding: "40px", textAlign: "center", color: "#999" },
};