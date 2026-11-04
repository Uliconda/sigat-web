// src/pages/Inventory.jsx
import { useState, useEffect } from "react";
import {
  addHistorial,
  getHistorial,
  subscribeToEquipos,
  updateEquipo,
} from "../services/supabaseData";
import { useAuth } from "../context/useAuth";
import Sidebar from "../components/Sidebar";


import QRCode from "qrcode";
import { descargarExcel } from "../utils/excel";
import { escapeHtml } from "../utils/html";
import Swal from 'sweetalert2';
import { mensajeDeError } from "../utils/errores";
import "./Inventory.css";

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
    const unsubscribe = subscribeToEquipos((data) => {
      setEquipos(data);
    }, (error) => console.error("Error al cargar equipos desde Supabase:", error));
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
      await updateEquipo(equipo.id, {
        estado: nuevoEstado,
        usuarioActual: userData?.nombre || "Usuario Web", 
      });

      await addHistorial({
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
      Swal.fire('No se guardó el movimiento', mensajeDeError(error), 'error');
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
      await updateEquipo(equipo.id, {
        estado: "Fuera de Servicio",
        usuarioActual: userData?.nombre || "Usuario Web", 
      });

      await addHistorial({
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
      Swal.fire('No se pudo dar de baja', mensajeDeError(error), 'error');
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
      await updateEquipo(equipo.id, {
        estado: "Disponible",
        usuarioActual: userData?.nombre || "Usuario Web", 
      }); 
      
      await addHistorial({
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
      Swal.fire('No se pudo reactivar', mensajeDeError(error), 'error');
    }
  };

  // ==========================================
  // 5. FUNCIÓN PARA GENERAR QR, DESCARGAR E IMPRIMIR
  // ==========================================
  const handleGenerateQR = async (equipo) => {
    // El QR se genera en el navegador: no depende de servicios externos.
    let qrUrl;
    try {
      qrUrl = await QRCode.toDataURL(String(equipo.id), { width: 500, margin: 2 });
    } catch (error) {
      console.error("Error al generar el QR:", error);
      Swal.fire("Error", "No se pudo generar el código QR de este equipo.", "error");
      return;
    }
    const nombreSeguro = escapeHtml(equipo.nombre);
    const idSeguro = escapeHtml(equipo.id);

    const result = await Swal.fire({
      title: `QR del Equipo`,
      html: `<b>${nombreSeguro}</b><br/><small>ID: ${idSeguro}</small>`,
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
      const link = document.createElement('a');
      link.href = qrUrl;
      link.download = `QR_${equipo.id}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    else if (result.dismiss === Swal.DismissReason.cancel) {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        Swal.fire("Ventana bloqueada", "Permite las ventanas emergentes de este sitio para imprimir el QR.", "warning");
        return;
      }
      printWindow.document.write(`
        <html lang="es">
          <head>
            <title>Imprimir QR - ${nombreSeguro}</title>
            <style>
              body { text-align: center; font-family: Arial, sans-serif; margin-top: 50px; }
              img { margin-top: 20px; }
              @media print { @page { margin: 0; } body { margin: 1.6cm; } }
            </style>
          </head>
          <body>
            <h2>${nombreSeguro}</h2>
            <p><strong>ID:</strong> ${idSeguro}</p>
            <img src="${qrUrl}" width="250" height="250" alt="Código QR" />
          </body>
        </html>
      `);
      printWindow.document.close();
      // Se imprime desde aquí: la ventana no ejecuta scripts propios.
      const imprimir = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      };
      const img = printWindow.document.querySelector("img");
      if (img?.complete) imprimir();
      else img?.addEventListener("load", imprimir, { once: true });
    }
  };

  // ==========================================
  // FUNCIÓN PARA EXPORTAR BASE DE DATOS PARA P-TOUCH (ETIQUETAS)
  // ==========================================
  const exportForPTouch = () => {
    // 1. Definimos los encabezados de las columnas
    let csvContent = "ID,Nombre_Equipo,No_Serie,Datos_QR\n";

    // 2. Usamos filteredEquipos en lugar de equipos
    filteredEquipos.forEach(item => {
      // Ignoramos plantillas
      if (item.isTemplate || item.nombre?.toLowerCase() === "plantilla sistema") return;

      // Escapamos las comas reemplazándolas por espacios para no romper el CSV
      const id = item.id || "";
      const nombre = (item.nombre || "---").replace(/,/g, "");
      const serie = (item.numeroSerie || "---").replace(/,/g, "");
      
      // Aquí defines qué es lo que lee tu QR
      const datosQR = id; 

      // Agregamos la fila al CSV
      csvContent += `${id},${nombre},${serie},${datosQR}\n`;
    });

    // 3. Creamos y descargamos el archivo CSV
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Inventario_Etiquetas_PTouch.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    Swal.fire("Exportado", "Archivo CSV generado para P-Touch Editor", "success");
  };

// ==========================================
  // 6. EXPORTAR EL HISTORIAL (EXCEL) CON REGISTRO HISTÓRICO REAL
  // ==========================================
  const exportHistoryToExcel = async () => {
    try {
      let nombreArchivo = `Reporte_SIGAT_Completo_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.xlsx`;
      let start;
      let end;

      if (reportType !== "all") {
        if (!startDate || !endDate) {
          Swal.fire("Faltan datos", "Por favor selecciona la fecha de inicio y fin para generar el reporte.", "warning");
          return;
        }

        start = new Date(startDate);
        start.setHours(0, 0, 0, 0); 
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999); 

        if (start > end) {
          Swal.fire("Error en las fechas", "La fecha de inicio no puede ser mayor a la fecha de fin.", "error");
          return;
        }

        nombreArchivo = `Reporte_SIGAT_${startDate}_al_${endDate}.xlsx`;
      }

      Swal.fire({ title: 'Generando...', text: 'Obteniendo datos de la nube', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

      const historial = await getHistorial({ start, end });

      if (historial.length === 0) {
        Swal.fire("Sin datos", "No hay movimientos registrados en este rango de fechas.", "info");
        return;
      }

      // Los cambios de carpetas (crear, renombrar, eliminar) van en su propia hoja.
      const movimientosEquipos = historial.filter((data) => data.tipo !== "carpeta");
      const cambiosCarpetas = historial.filter((data) => data.tipo === "carpeta");

      const datosHistorial = movimientosEquipos.map((data) => {

        const fechaLegible = data.fecha
          ? new Date(data.fecha).toLocaleString("es-MX")
          : "Sin fecha";

        const equipoInfo = equipos.find(e => e.id === data.idEquipo);

        // 🌟 LÓGICA DE ESTADO HISTÓRICO: Determinamos qué estado tenía en ESE momento exacto
        let estadoEnEseMomento = "DISPONIBLE";
        let condicionEnEseMomento = "Buen estado";

        const accionNormalizada = data.accion ? data.accion.toUpperCase() : "";
        const obsNormalizada = data.observaciones ? data.observaciones.toUpperCase() : "";

        if (accionNormalizada === "PRÉSTAMO") {
          estadoEnEseMomento = "PRESTADO";
          // En los préstamos usualmente no se evalúa condición física nueva, toma la que traía o "Buen estado"
          condicionEnEseMomento = equipoInfo?.condicion_fisica || "Buen estado"; 
        } 
        else if (accionNormalizada === "BAJA") {
          estadoEnEseMomento = "FUERA DE SERVICIO";
          condicionEnEseMomento = "Reemplazar / Averiado";
        } 
        else if (accionNormalizada === "REACTIVACIÓN") {
          estadoEnEseMomento = "DISPONIBLE";
          condicionEnEseMomento = "Buen estado (Reparado)";
        } 
        else if (accionNormalizada === "DEVOLUCIÓN") {
          estadoEnEseMomento = "DISPONIBLE";
          
          // 🌟 Mapeo inteligente de la condición física guardada en el texto de observaciones de la app móvil
          if (obsNormalizada.includes("CONDICIÓN FÍSICA: ACEPTABLE") || obsNormalizada.includes("ACEPTABLE")) {
            condicionEnEseMomento = "Aceptable";
          } else if (obsNormalizada.includes("CONDICIÓN FÍSICA: REEMPLAZAR") || obsNormalizada.includes("REEMPLAZAR")) {
            condicionEnEseMomento = "Reemplazar";
          } else {
            condicionEnEseMomento = "Buen estado";
          }
        }

        return {
          "Fecha y Hora": fechaLegible,
          "ID Equipo": data.idEquipo,
          "Nombre Equipo": data.nombreEquipo,
          "Categoría": equipoInfo?.categoria || "---",
          "Subcategoría": equipoInfo?.subcategoria || "---",          
          "Tipo (Sub-Sub)": equipoInfo?.subSubcategoria || "---",     
          // 🌟 AHORA MUESTRAN EL ESTADO Y CONDICIÓN DE ESE DÍA ESPECÍFICO
          "Estado en ese Movimiento": estadoEnEseMomento,
          "Condición Física en el registro": condicionEnEseMomento,
          "Acción efectuada": data.accion,
          "Administrador": data.admin,
          "Observaciones del movimiento": data.observaciones,
        };
      });

      const datosCarpetas = cambiosCarpetas.map((data) => ({
        "Fecha y Hora": data.fecha ? new Date(data.fecha).toLocaleString("es-MX") : "Sin fecha",
        "Acción efectuada": data.accion,
        "Carpeta": data.carpeta,
        "Equipos afectados": data.equiposAfectados ?? 0,
        "Administrador": data.admin,
        "Observaciones": data.observaciones,
      }));
      await descargarExcel(nombreArchivo, [
        { nombre: "Historial", filas: datosHistorial },
        { nombre: "Carpetas", filas: datosCarpetas },
      ]);
      
      Swal.fire("¡Descarga lista!", "El archivo Excel se ha generado correctamente.", "success");

    } catch (error) {
      console.error("Error al generar Excel:", error);
      Swal.fire("No se pudo generar el Excel", mensajeDeError(error), "error");
    }
  };

// ==========================================
  // 7. FUNCIÓN PARA EXPORTAR A PDF (CON SELECTOR AGRUPADO ORDENADO)
  // ==========================================
  const exportToPDF = async () => {
    const inputOptions = {
      "General": {
        "Todo": "🌟 Todo el inventario (Completo)"
      }
    };
    
    // ✨ LA SOLUCIÓN: Ordenamos el inventario jerárquicamente antes de agrupar.
    // Esto asegura que cada hijo se inserte justo después de su padre.
    const equiposOrdenados = [...equipos].sort((a, b) => {
      const catA = (a.categoria || "").toUpperCase();
      const catB = (b.categoria || "").toUpperCase();
      if (catA !== catB) return catA.localeCompare(catB);

      const subA = (a.subcategoria || "").toUpperCase();
      const subB = (b.subcategoria || "").toUpperCase();
      if (subA !== subB) return subA.localeCompare(subB);

      const subSubA = (a.subSubcategoria || "").toUpperCase();
      const subSubB = (b.subSubcategoria || "").toUpperCase();
      return subSubA.localeCompare(subSubB);
    });

    // Usamos el nuevo arreglo "equiposOrdenados" en lugar del original
    equiposOrdenados.forEach(item => {
      if (item.isTemplate || item.nombre?.toLowerCase() === "plantilla sistema") return;
      
      const cat = item.categoria;
      const sub = item.subcategoria;
      const subSub = item.subSubcategoria;

      if (cat) {
        // 1. Nivel Categoría
        if (!inputOptions[cat]) {
          inputOptions[cat] = {};
          inputOptions[cat][cat] = `📁 ${cat} (Completo)`;
        }
        
        // 2. Nivel Subcategoría
        if (sub && sub.toUpperCase() !== "GENERAL") {
          const claveSub = `${cat}|${sub}`;
          if (!inputOptions[cat][claveSub]) {
            inputOptions[cat][claveSub] = ` ↳ ${cat} solo ${sub}`;
          }
          
          // 3. Nivel Sub-Subcategoría
          if (subSub && subSub.toUpperCase() !== "GENERAL") {
            const claveSubSub = `${cat}|${sub}|${subSub}`;
            if (!inputOptions[cat][claveSubSub]) {
              inputOptions[cat][claveSubSub] = `    • ${sub} > solo ${subSub}`;
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
        equiposAExportar = filteredEquipos.filter(item => item.categoria === parts[0] && item.subcategoria === parts[1] && item.subSubcategoria === parts[2]);
        tituloSecundario = `${parts[0]} > ${parts[1]} > ${parts[2]}`;
      } 
      else if (parts.length === 2) {
        equiposAExportar = filteredEquipos.filter(item => item.categoria === parts[0] && item.subcategoria === parts[1]);
        tituloSecundario = `${parts[0]} > ${parts[1]}`;
      } 
      else {
        equiposAExportar = filteredEquipos.filter(item => item.categoria === parts[0]);
        tituloSecundario = `${parts[0]} (Completo)`;
      }
    }

    if (equiposAExportar.length === 0) {
      Swal.fire("Sin datos", "No se encontraron equipos para esta selección.", "info");
      return;
    }

    // jsPDF se carga solo al exportar para no aumentar la carga inicial.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF("landscape");
    
    const tituloPDF = seleccion === "Todo" 
      ? "Estado Actual del Inventario - SIGAT (Completo)"
      : `Reporte de Inventario - ${tituloSecundario}`;

    doc.text(tituloPDF, 14, 15);

    // 1. Añadimos "No. Serie" a los encabezados
    const tableColumn = [
      "ID", 
      "Nombre / Modelo", 
      "No. Serie", // 👈 Nueva columna agregada
      "Categoría", 
      "Sub.", 
      "Sub-Sub", 
      "Estado", 
      "Usuario", 
      "Poseedor"
    ];
    
    // 2. Extraemos el número de serie de los datos del equipo
    const tableRows = equiposAExportar.map((item) => {
      const estadoActual = item.estado ? item.estado.toUpperCase() : "DISPONIBLE";
      const poseedor = item.alumno_nombre || (estadoActual === "DISPONIBLE" ? "En almacén" : "Sin asignar");

      return [
        item.id, 
        item.nombre, 
        item.no_serie || "---", // 👈 Asegúrate de que el nombre de esta propiedad ("numeroSerie") coincida con el de tu base de datos/estado
        item.categoria || "---", 
        item.subcategoria || "---", 
        item.subSubcategoria || "---", 
        item.estado, 
        item.usuarioActual || "---",
        poseedor 
      ];
    });

    autoTable(doc, {
      head: [tableColumn], 
      body: tableRows, 
      startY: 20, 
      theme: "grid", 
      headStyles: { fillColor: "#ff6600", textColor: "#fff" },
      styles: { fontSize: 7.5, overflow: "linebreak" }, 
      columnStyles: {
        // 3. ¡Importante! Cambiamos el índice a 8, porque ahora "Poseedor" es la columna número 8 (empezando desde el 0)
        8: { cellWidth: 50 } 
      }
    });
    
    const nombreArchivo = seleccion === "Todo" 
      ? "Inventario_Completo_SIGAT.pdf" 
      : `Inventario_${seleccion.replace(/\|/g, '_').replace(/\s+/g, '')}_SIGAT.pdf`;
      
    doc.save(nombreArchivo);
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <header className="pagina-encabezado">
          <div>
            <h1 className="pagina-titulo">Inventario y Reportes</h1>
            <p className="pagina-subtitulo">Gestiona equipos y descarga la bitácora completa de movimientos</p>
          </div>

          <div className="inventario-acciones">
            <div className="inventario-exportar">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="inventario-exportar__select"
                aria-label="Periodo del reporte"
              >
                <option value="all">Todo el historial</option>
                <option value="rango">Elegir Fechas...</option>
              </select>

              {reportType === "rango" && (
                <div className="inventario-exportar__fechas">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="inventario-exportar__fecha" aria-label="Fecha de inicio" />
                  <span>a</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="inventario-exportar__fecha" aria-label="Fecha de fin" />
                </div>
              )}

              <button type="button" onClick={exportHistoryToExcel} className="inventario-boton inventario-boton--excel">
                {reportType === "all" ? "📊 Descargar TODO" : "📊 Descargar Rango"}
              </button>
            </div>

            <button type="button" onClick={exportToPDF} className="inventario-boton inventario-boton--pdf">📄 PDF Vista Actual</button>
            <button type="button" onClick={exportForPTouch} className="inventario-boton inventario-boton--ptouch">
              🖨️ Exportar Base de datos
            </button>
          </div>
        </header>

        <div className="inventario-buscador">
          <span aria-hidden="true">🔍</span>
          <input
            type="search"
            aria-label="Buscar equipos"
            placeholder="Buscar por nombre o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="tabla-tarjeta">
          <table className="tabla inventario-tabla">
            <thead>
              <tr>
                <th>ID EQUIPO</th>
                <th>NOMBRE / MODELO</th>
                <th>ESTADO</th>
                <th>ÚLTIMO USUARIO</th>
                <th className="centrado">QR</th>
                <th className="centrado">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquipos.map((item) => (
                <tr key={item.id}>
                  <td className="negrita">{item.id}</td>
                  <td>{item.nombre}</td>
                  <td>
                    <span className={`etiqueta inventario-estado--${claseEstado(item.estado)}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td>{item.usuarioActual || "---"}</td>

                  <td className="centrado">
                    <button type="button" onClick={() => handleGenerateQR(item)} className="inventario-qr" title="Ver Código QR del equipo">🔳 QR</button>
                  </td>

                  <td className="centrado">
                    <div className="inventario-fila-acciones">
                      {item.estado?.toLowerCase() !== "fuera de servicio" ? (
                        <>
                          <button type="button" onClick={() => handleToggleStatus(item)} className="inventario-accion" title="Cambiar estado (Prestar/Devolver)">🔄 Estado</button>
                          <button type="button" onClick={() => handleDiscardEquipment(item)} className="inventario-accion inventario-accion--baja" title="Marcar como descompuesto o fuera de servicio">🚫 Baja</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => handleRestoreEquipment(item)} className="inventario-accion inventario-accion--reactivar" title="Volver a activar este equipo">✅ Reactivar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredEquipos.length === 0 && (
            <div className="tabla-vacia">No se encontraron equipos que coincidan.</div>
          )}
        </div>
      </main>
    </div>
  );
}

// Clase CSS según el estado del equipo (los colores están en Inventory.css).
function claseEstado(estado) {
  const valor = (estado ?? "").toLowerCase();
  if (valor === "disponible") return "disponible";
  if (valor === "prestado" || valor === "sin entregar") return "prestado";
  if (valor === "no responde") return "falta";
  return "otro";
}
