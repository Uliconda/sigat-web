// src/pages/QrGenerator.jsx
import { useState, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import Sidebar from "../components/Sidebar";

export default function QrGenerator() {
const [equipmentId, setEquipmentId] = useState("");
const qrRef = useRef(null); // Referencia para poder descargar la imagen

// Función para descargar el QR como imagen PNG
const downloadQR = () => {
if (!equipmentId.trim()) {
    alert("Por favor, ingresa un ID válido antes de descargar.");
    return;
}

// Buscamos el elemento "canvas" que genera la librería qrcode.react
const canvas = qrRef.current.querySelector("canvas");
if (canvas) {
    const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
    const downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = `QR_SIGAT_${equipmentId}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}
};

return (
<div className="app-layout">
    <Sidebar />
    
    <main className="app-main">
    <h1 style={styles.title}>Generador de Etiquetas QR</h1>
    <p style={styles.subtitle}>Crea códigos para adherir a los equipos físicos</p>

    <div style={styles.container}>
        
        {/* COLUMNA IZQUIERDA: Formulario */}
        <div style={styles.formSection}>
        <div style={styles.inputGroup}>
            <label style={styles.label}>ID del Equipo</label>
            <input
            type="text"
            placeholder="Ej. LAP-001, PROY-05"
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value.toUpperCase())}
            style={styles.input}
            maxLength={20}
            />
            <small style={styles.helperText}>
            Este ID debe coincidir exactamente con el ID registrado en tu base de datos.
            </small>
        </div>

        <button 
            onClick={downloadQR} 
            style={{
            ...styles.downloadBtn,
            opacity: equipmentId ? 1 : 0.5,
            cursor: equipmentId ? "pointer" : "not-allowed"
            }}
            disabled={!equipmentId}
        >
            📥 Descargar Imagen QR
        </button>
        </div>

        {/* COLUMNA DERECHA: Vista Previa */}
        <div style={styles.previewSection}>
        <h3 style={styles.previewTitle}>Vista Previa</h3>
        
        <div style={styles.qrCard} ref={qrRef}>
            {equipmentId ? (
            <>
                <QRCodeCanvas 
                value={equipmentId} 
                size={200} 
                bgColor={"#ffffff"}
                fgColor={"#000000"}
                level={"H"} // Alto nivel de corrección de errores (ideal si se ensucia la etiqueta)
                />
                <p style={styles.qrIdText}>{equipmentId}</p>
            </>
            ) : (
            <div style={styles.emptyState}>
                <span style={{ fontSize: "40px" }}>🔲</span>
                <p>Escribe un ID para generar el código</p>
            </div>
            )}
        </div>
        </div>

    </div>
    </main>
</div>
);
}

const styles = {
title: { margin: 0, fontSize: "clamp(22px, 5vw, 28px)", color: "var(--text-color)" },
subtitle: { color: "var(--text-muted)", marginBottom: "32px" },
container: { display: "flex", flexWrap: "wrap", gap: "32px", backgroundColor: "var(--card-bg)", padding: "clamp(20px, 4vw, 40px)", borderRadius: "15px", border: "1px solid var(--border-color)", boxShadow: "var(--shadow-sm)" },
formSection: { flex: "1 1 280px", display: "flex", flexDirection: "column", justifyContent: "center" },
inputGroup: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "30px" },
label: { fontSize: "16px", fontWeight: "600", color: "var(--text-color)" },
input: { padding: "15px", borderRadius: "8px", border: "2px solid var(--border-color)", backgroundColor: "var(--input-bg)", color: "var(--text-color)", fontSize: "18px", textTransform: "uppercase", outline: "none", transition: "border 0.3s" },
helperText: { color: "var(--text-muted)", fontSize: "13px" },
downloadBtn: { backgroundColor: "var(--primary)", color: "white", border: "none", padding: "15px", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", transition: "0.2s" },
previewSection: { flex: "1 1 280px", display: "flex", flexDirection: "column", alignItems: "center", borderLeft: "2px dashed var(--border-color)", paddingLeft: "16px" },
previewTitle: { margin: "0 0 20px 0", color: "var(--text-muted)" },
// La tarjeta del QR se queda blanca: es lo que se imprime y escanea.
qrCard: { backgroundColor: "#fff", padding: "30px", border: "1px solid #eee", borderRadius: "12px", boxShadow: "0 8px 16px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "center", minWidth: "min(250px, 100%)", minHeight: "250px", justifyContent: "center" },
qrIdText: { marginTop: "15px", fontSize: "20px", fontWeight: "800", color: "#333", letterSpacing: "1px" },
emptyState: { textAlign: "center", color: "#aaa" }
};