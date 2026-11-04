// src/pages/Maintenance.tsx
import { useEffect, useState } from 'react';
import Sidebar from "../components/Sidebar";
import Swal from "sweetalert2";
import { addHistorial, getEquipos, updateEquipo } from "../services/supabaseData";
import { useAuth } from "../context/useAuth";
import type { Equipo } from "../types";
import { mensajeDeError } from "../utils/errores";
import "./Maintenance.css";

type TonoAlerta = "exito" | "aviso" | "peligro";

// Algunos equipos antiguos guardaban el nombre en "name".
const nombreDe = (item: Equipo): string => String(item.nombre ?? item.name ?? "");

const Maintenance = () => {
const [maintenanceAlerts, setMaintenanceAlerts] = useState<Equipo[]>([]);
const [currentTime] = useState(() => Date.now());
const { userData } = useAuth(); // Extraemos los datos del usuario activo

useEffect(() => {
const fetchMaintenanceAlerts = async () => {
    try {
    setMaintenanceAlerts(await getEquipos());
    } catch (error) {
    console.error("Error al cargar equipos desde Supabase:", error);
    }
};

fetchMaintenanceAlerts();
}, []);

const formatDate = (value?: string) => {
if (!value) return "Sin revisión";
const date = new Date(value);
return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
}).format(date);
};

const getAlertStatus = (value?: string): { status: string; tono: TonoAlerta } => {
if (!value) {
    return { status: "Pendiente", tono: "aviso" };
}

const date = new Date(value);
const diffMs = currentTime - date.getTime();
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

if (diffDays > 360) {
    return { status: "Urgente", tono: "peligro" };
}
if (diffDays > 90) {
    return { status: "Ir revisando estado del equipo", tono: "aviso" };
}
return { status: "En tiempo", tono: "exito" };

};

const handleSchedule = async (item: Equipo) => {
// SweetAlert simplificado e idéntico al de Inventory
const { value: observacion, isConfirmed } = await Swal.fire({
    title: 'Registrar Mantenimiento',
    text: `Detalla el mantenimiento realizado al equipo "${nombreDe(item) || item.id}":`,
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
    // 1. Actualizamos el equipo en la base de datos
    const fechaRevision = new Date().toISOString();
    await updateEquipo(item.id, {
    fecha_revision: fechaRevision,
    observacion_revision: observacion,
    });

    // 2. Registramos en el Historial (Formato idéntico al Inventario para que salga en el Excel)
    await addHistorial({
    idEquipo: item.id,
    nombreEquipo: nombreDe(item) || "Sin Nombre",
    accion: "MANTENIMIENTO",
    fecha: new Date(), // Usamos Date para mantener compatibilidad con tu Excel
    admin: userData?.nombre || "Usuario Web",
    observaciones: `Mantenimiento Preventivo: ${observacion}`,
    });

    // 3. Actualizamos la vista local sin recargar la página
    setMaintenanceAlerts((prev) =>
    prev.map((row) =>
        row.id === item.id
        ? { ...row, fecha_revision: fechaRevision, observacion_revision: observacion }
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
    Swal.fire('No se guardó el mantenimiento', mensajeDeError(error), 'error');
}
};

return (
<div className="app-layout">
    <Sidebar />

    <main className="app-main">
    <header className="pagina-encabezado">
        <div>
        <h1 className="pagina-titulo">Mantenimiento Preventivo (RCM)</h1>
        <p className="pagina-subtitulo">Gestión de alertas para evitar mantenimientos correctivos y alargar la vida útil.</p>
        </div>
    </header>

    <div className="tabla-tarjeta">
        <table className="tabla mantenimiento-tabla">
        <thead>
            <tr>
            <th>ID</th>
            <th>EQUIPO</th>
            <th>ÚLTIMA REVISIÓN</th>
            <th>ESTADO DE ALERTA</th>
            <th>OBSERVACIÓN</th>
            <th className="centrado">ACCIONES</th>
            </tr>
        </thead>
        <tbody>
            {maintenanceAlerts.map((item) => {
            const { status, tono } = getAlertStatus(item.fecha_revision || item.lastCheck);

            return (
                <tr key={item.id}>
                <td className="negrita">{item.id}</td>
                <td>{nombreDe(item)}</td>
                <td>{formatDate(item.fecha_revision || item.lastCheck)}</td>
                <td>
                    <span className={`etiqueta etiqueta--${tono}`}>{status}</span>
                </td>
                <td className="mantenimiento-observacion">
                    {item.observacion_revision ? (
                        item.observacion_revision.length > 40
                        ? `${item.observacion_revision.substring(0, 40)}...`
                        : item.observacion_revision
                    ) : "—"}
                </td>
                <td className="centrado">
                    <button
                    type="button"
                    onClick={() => handleSchedule(item)}
                    className="btn-accion"
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
        <div className="tabla-vacia">No hay equipos registrados para revisar.</div>
        )}
    </div>
    </main>
</div>
);
};

export default Maintenance;