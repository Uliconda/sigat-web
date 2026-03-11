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
<div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
    <Sidebar />
    
    <main style={{ marginLeft: "250px", flex: 1, padding: "40px" }}>
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
            Este ID debe coincidir exactamente con el ID registrado en tu base de datos (Firestore).
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
title: { margin: 0, fontSize: "28px", color: "#1a1a1a" },
subtitle: { color: "#666", marginBottom: "40px" },
container: { display: "flex", gap: "40px", backgroundColor: "#fff", padding: "40px", borderRadius: "15px", border: "1px solid #e0e0e0", boxShadow: "0 4px 10px rgba(0,0,0,0.02)" },
formSection: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" },
inputGroup: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "30px" },
label: { fontSize: "16px", fontWeight: "600", color: "#333" },
input: { padding: "15px", borderRadius: "8px", border: "2px solid #ddd", fontSize: "18px", textTransform: "uppercase", outline: "none", transition: "border 0.3s" },
helperText: { color: "#888", fontSize: "13px" },
downloadBtn: { backgroundColor: "#ff6600", color: "white", border: "none", padding: "15px", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", transition: "0.2s" },
previewSection: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", borderLeft: "2px dashed #eee" },
previewTitle: { margin: "0 0 20px 0", color: "#555" },
qrCard: { backgroundColor: "#fff", padding: "30px", border: "1px solid #eee", borderRadius: "12px", boxShadow: "0 8px 16px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "center", minWidth: "250px", minHeight: "250px", justifyContent: "center" },
qrIdText: { marginTop: "15px", fontSize: "20px", fontWeight: "800", color: "#333", letterSpacing: "1px" },
emptyState: { textAlign: "center", color: "#aaa" }
};