// src/pages/QrGenerator.jsx
import { useState, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import Sidebar from "../components/Sidebar";
import "./QrGenerator.css";

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
    <header className="pagina-encabezado">
        <div>
        <h1 className="pagina-titulo">Generador de Etiquetas QR</h1>
        <p className="pagina-subtitulo">Crea códigos para adherir a los equipos físicos</p>
        </div>
    </header>

    <div className="qr-contenedor">

        {/* COLUMNA IZQUIERDA: Formulario */}
        <div className="qr-formulario">
        <div className="qr-campo">
            <label htmlFor="qr-id" className="qr-etiqueta">ID del Equipo</label>
            <input
            id="qr-id"
            type="text"
            placeholder="Ej. LAP-001, PROY-05"
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value.toUpperCase())}
            className="qr-input"
            maxLength={20}
            />
            <small className="qr-ayuda">
            Este ID debe coincidir exactamente con el ID registrado en tu base de datos.
            </small>
        </div>

        <button type="button" onClick={downloadQR} className="qr-descargar" disabled={!equipmentId}>
            📥 Descargar Imagen QR
        </button>
        </div>

        {/* COLUMNA DERECHA: Vista Previa */}
        <div className="qr-vista">
        <h3 className="qr-vista__titulo">Vista Previa</h3>

        <div className="qr-tarjeta" ref={qrRef}>
            {equipmentId ? (
            <>
                <QRCodeCanvas
                value={equipmentId}
                size={200}
                bgColor={"#ffffff"}
                fgColor={"#000000"}
                level={"H"} // Alto nivel de corrección de errores (ideal si se ensucia la etiqueta)
                />
                <p className="qr-tarjeta__id">{equipmentId}</p>
            </>
            ) : (
            <div className="qr-tarjeta__vacia">
                <span aria-hidden="true">🔲</span>
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
