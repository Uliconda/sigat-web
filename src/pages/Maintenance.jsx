// src/pages/Maintenance.jsx
import React, { useEffect, useState } from 'react';
import Sidebar from "../components/Sidebar";
import Swal from "sweetalert2";
import { collection, doc, getDocs, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext"; // Importamos para saber quién hace el mantenimiento

const Maintenance = () => {
const [maintenanceAlerts, setMaintenanceAlerts] = useState([]);
const { userData } = useAuth(); // Extraemos los datos del usuario activo

useEffect(() => {
const fetchMaintenanceAlerts = async () => {
    const querySnapshot = await getDocs(collection(db, "Equipos"));
    const items = querySnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
    }));
    setMaintenanceAlerts(items);
};

fetchMaintenanceAlerts();
}, []);

const formatDate = (value) => {
if (!value) return "Sin revisión";
const date = value.toDate ? value.toDate() : new Date(value);
return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
}).format(date);
};

const getAlertStatus = (value) => {
if (!value) {
    return { status: "Pendiente", color: "#ffcc00", bgColor: "rgba(255, 204, 0, 0.1)" };
}

const date = value.toDate ? value.toDate() : new Date(value);
const diffMs = Date.now() - date.getTime();
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

if (diffDays > 90) {
    return { status: "Urgente", color: "#ff4444", bgColor: "rgba(255, 68, 68, 0.1)" };
}
if (diffDays > 60) {
    return { status: "Próxima revisión", color: "#ffcc00", bgColor: "rgba(255, 204, 0, 0.1)" };
}
return { status: "En tiempo", color: "#4caf50", bgColor: "rgba(76, 175, 80, 0.1)" };
};

const handleSchedule = async (item) => {
// SweetAlert simplificado e idéntico al de Inventory
const { value: observacion, isConfirmed } = await Swal.fire({
    title: 'Registrar Mantenimiento',
    text: `Detalla el mantenimiento realizado al equipo "${item.nombre || item.name || item.id}":`,
    icon: 'info',
    input: 'textarea',
    inputPlaceholder: 'Ej. Limpieza general, cambio de piezas, ajuste de cableado...',
    showCancelButton: true,
    confirmButtonColor: '#ff6600',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Guardar Registro',
    cancelButtonText: 'Cancelar',
    inputValidator: (value) => {
    if (!value) return '¡Necesitas escribir un detalle para el historial!';
    }
});

if (!isConfirmed) return;

try {
    const docRef = doc(db, "Equipos", item.id);

    // 1. Actualizamos el equipo en la base de datos
    await updateDoc(docRef, {
    fecha_revision: serverTimestamp(),
    observacion_revision: observacion,
    });

    // 2. Registramos en el Historial (Formato idéntico al Inventario para que salga en el Excel)
    await addDoc(collection(db, "Historial"), {
    idEquipo: item.id,
    nombreEquipo: item.nombre || item.name || "Sin Nombre",
    accion: "MANTENIMIENTO",
    fecha: new Date(), // Usamos Date para mantener compatibilidad con tu Excel
    admin: userData?.nombre || "Usuario Web",
    observaciones: `Mantenimiento Preventivo: ${observacion}`,
    });

    // 3. Actualizamos la vista local sin recargar la página
    setMaintenanceAlerts((prev) =>
    prev.map((row) =>
        row.id === item.id
        ? { ...row, fecha_revision: new Date(), observacion_revision: observacion }
        : row
    )
    );

    Swal.fire({
    title: "¡Revisión Registrada!",
    text: "El mantenimiento se ha guardado en el historial correctamente.",
    icon: "success",
    timer: 2000,
    showConfirmButton: false
    });

} catch (error) {
    console.error("Error al guardar mantenimiento:", error);
    Swal.fire('Error', 'Hubo un problema al conectar con la base de datos.', 'error');
}
};

return (
<div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--bg-color)", transition: "0.3s" }}>
    <Sidebar />
    
    <main style={{ marginLeft: "250px", flex: 1, padding: "40px" }}>
    <header style={styles.header}>
        <div>
        <h1 style={styles.title}>Mantenimiento Preventivo (RCM)</h1>
        <p style={styles.subtitle}>Gestión de alertas para evitar mantenimientos correctivos y alargar la vida útil.</p>
        </div>
    </header>

    <div style={styles.tableCard}>
        <table style={styles.table}>
        <thead>
            <tr style={styles.theadRow}>
            <th style={styles.th}>ID</th>
            <th style={styles.th}>EQUIPO</th>
            <th style={styles.th}>ÚLTIMA REVISIÓN</th>
            <th style={styles.th}>ESTADO DE ALERTA</th>
            <th style={styles.th}>OBSERVACIÓN</th>
            <th style={{ ...styles.th, textAlign: "center" }}>ACCIONES</th>
            </tr>
        </thead>
        <tbody>
            {maintenanceAlerts.map((item, index) => {
            const { status, color, bgColor } = getAlertStatus(item.fecha_revision || item.lastCheck);
            
            return (
                <tr key={index} style={styles.tr}>
                <td style={{ ...styles.td, fontWeight: "bold" }}>{item.id}</td>
                <td style={styles.td}>{item.nombre || item.name}</td>
                <td style={styles.td}>{formatDate(item.fecha_revision || item.lastCheck)}</td>
                <td style={styles.td}>
                    <span style={{ ...styles.statusBadge, backgroundColor: bgColor, color: color, border: `1px solid ${color}40` }}>
                    {status}
                    </span>
                </td>
                <td style={{ ...styles.td, color: "var(--text-color)", opacity: 0.8, maxWidth: "200px" }}>
                    {item.observacion_revision ? (
                        item.observacion_revision.length > 40 
                        ? `${item.observacion_revision.substring(0, 40)}...` 
                        : item.observacion_revision
                    ) : "—"}
                </td>
                <td style={{ ...styles.td, textAlign: "center" }}>
                    <button
                    onClick={() => handleSchedule(item)}
                    style={styles.btnAction}
                    title="Registrar nuevo mantenimiento"
                    >
                    🛠️ Realizar Revisión
                    </button>
                </td>
                </tr>
            );
            })}
        </tbody>
        </table>

        {maintenanceAlerts.length === 0 && (
        <div style={styles.noResults}>No hay equipos registrados para revisar.</div>
        )}
    </div>
    </main>
</div>
);
};

// ==========================================
// ESTILOS ADAPTADOS A VARIABLES GLOBALES
// ==========================================
const styles = {
header: { marginBottom: "30px" },
title: { margin: 0, fontSize: "28px", color: "var(--text-color)", transition: "0.3s" },
subtitle: { margin: "5px 0 0 0", color: "var(--text-color)", opacity: 0.7, transition: "0.3s" },

tableCard: { backgroundColor: "var(--card-bg)", borderRadius: "15px", border: "1px solid var(--border-color)", overflow: "hidden", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", transition: "0.3s" },
table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
theadRow: { backgroundColor: "var(--bg-color)", borderBottom: "2px solid var(--border-color)", transition: "0.3s" },
th: { padding: "18px 20px", fontSize: "13px", color: "var(--text-color)", opacity: 0.7, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" },
tr: { borderBottom: "1px solid var(--border-color)", transition: "0.2s" },
td: { padding: "18px 20px", color: "var(--text-color)", fontSize: "15px" },

statusBadge: { padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", display: "inline-block" },
btnAction: { backgroundColor: "#ff6600", color: "white", border: "none", padding: "10px 15px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold", transition: "0.3s" },
noResults: { padding: "40px", textAlign: "center", color: "var(--text-color)", opacity: 0.6 },
};

export default Maintenance;