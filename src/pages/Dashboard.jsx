// src/pages/Dashboard.jsx
import { useState, useEffect, useContext } from "react"; 
import {
  addHistorial,
  DIAS_HISTORIAL_DASHBOARD,
  notificarPrestamo,
  subscribeToEquipos,
  subscribeToHistorial,
  updateEquipo,
} from "../services/supabaseData";
import { useAuth } from "../context/useAuth";
import { ThemeContext } from "../context/theme"; 
import Sidebar from "../components/Sidebar";
import Swal from 'sweetalert2'; 
import { mensajeDeError } from "../utils/errores";
import "./Dashboard.css";
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line 
} from "recharts";

export default function Dashboard() {
  const { userData } = useAuth();
  const { theme, toggleTheme } = useContext(ThemeContext); 

  // Estados de Métricas e Inventario
  const [metrics, setMetrics] = useState({ 
    total: 0, disponibles: 0, prestados: 0, fueraDeServicio: 0, faltas: 0 
  });
  const [prestadosList, setPrestadosList] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);

  // Estados de Estadísticas (Historial)
  const [topEquipos, setTopEquipos] = useState([]);
  const [horariosPico, setHorariosPico] = useState([]);

  const STATUS_COLORS = ["#2e7d32", "#c62828", "#616161", "#ad1457"];

// 1. ESCUCHA DE INVENTARIO (Equipos)
  useEffect(() => {
    const unsubscribe = subscribeToEquipos((docs) => {
      
      // Filtramos para quedarnos ÚNICAMENTE con los equipos reales
      const equiposReales = docs.filter(item => 
        !item.isTemplate && item.nombre?.toLowerCase() !== "plantilla sistema"
      );
      
      const disponibles = equiposReales.filter(i => i.estado?.toLowerCase() === "disponible").length;
      const prestados = equiposReales.filter(i => 
        ["prestado", "sin entregar"].includes(i.estado?.toLowerCase())
      ).length;
      const fueraDeServicio = equiposReales.filter(i => i.estado?.toLowerCase() === "fuera de servicio").length;
      const faltas = equiposReales.filter(i => i.estado?.toLowerCase() === "no responde").length;
      
      setMetrics({ total: equiposReales.length, disponibles, prestados, fueraDeServicio, faltas });

      // 👇 AQUÍ ESTÁ EL CAMBIO: Filtramos por estado y EXCLUIMOS a los ADMINISTRATIVOS
      const equiposFuera = equiposReales.filter(i => {
        const esPrestado = ["prestado", "sin entregar", "no responde"].includes(i.estado?.toLowerCase());
        const noEsAdministrativo = i.categoria?.toUpperCase() !== "ADMINISTRATIVOS";
        
        return esPrestado && noEsAdministrativo; 
      });
      
      setPrestadosList(equiposFuera);

      setStatusData([
        { name: "Disponibles", value: disponibles },
        { name: "Prestados", value: prestados },
        { name: "Fuera de Servicio", value: fueraDeServicio },
        { name: "Faltas", value: faltas }
      ]);

      const catCounts = {};
      equiposReales.forEach(equipo => {
        const cat = equipo.categoria || "General";
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
      setCategoryData(Object.keys(catCounts).map(key => ({ categoria: key, cantidad: catCounts[key] })));
    }, (error) => console.error("Error al cargar equipos desde Supabase:", error));

    return () => unsubscribe();
  }, []);

  // 2. ESCUCHA DE ESTADÍSTICAS (Historial)
  useEffect(() => {
    const unsubscribe = subscribeToHistorial((historial) => {
      const conteoEquipos = {};
      const conteoHoras = {};

      historial.forEach(data => {
        const esPrestamo = data.accion && (
            data.accion.toLowerCase().includes("préstamo") || 
            data.accion.toLowerCase().includes("prestamo")
        );

        if (esPrestamo) {
          const nombre = data.nombreEquipo || "Desconocido";
          conteoEquipos[nombre] = (conteoEquipos[nombre] || 0) + 1;

          if (data.fecha) {
            const dateObj = new Date(data.fecha);
            const hora = `${dateObj.getHours()}:00`;
            conteoHoras[hora] = (conteoHoras[hora] || 0) + 1;
          }
        }
      });

      const top = Object.keys(conteoEquipos)
        .map(key => ({ equipo: key, prestamos: conteoEquipos[key] }))
        .sort((a, b) => b.prestamos - a.prestamos).slice(0, 5);
      setTopEquipos(top);

      const horas = Object.keys(conteoHoras)
        .map(key => ({ hora: key, cantidad: conteoHoras[key], num: parseInt(key) }))
        .sort((a, b) => a.num - b.num);
      setHorariosPico(horas);
    }, (error) => console.error("Error al cargar historial desde Supabase:", error));

    return () => unsubscribe();
  }, []);


  // Los préstamos vencidos (48 h) los revisa el servidor cada hora con pg_cron:
  // ver supabase/functions/notificaciones-prestamos y supabase/cron/alertas-prestamos.sql.

  // 3. FUNCIÓN MANEJO DE FALTAS MANUALES
  const handleToggleFalta = async (item) => {
    const tieneFalta = item.estado?.toLowerCase() === "no responde";
    
    const swalConfig = tieneFalta 
      ? { title: '¿Retirar Falta?', text: `Se quitará la marca de moroso a "${item.nombre}" y volverá a estar Prestado.`, icon: 'info', confirmButtonColor: '#28a745' }
      : { title: '¿Marcar Falta?', text: `Se enviará un correo automático de advertencia a quien tiene el equipo "${item.nombre}".`, icon: 'warning', confirmButtonColor: '#d33' };

    const result = await Swal.fire({ ...swalConfig, showCancelButton: true, cancelButtonColor: '#6c757d', confirmButtonText: 'Sí, continuar', cancelButtonText: 'Cancelar' });

    if (!result.isConfirmed) return;

    try {
      Swal.fire({ title: 'Procesando...', text: 'Actualizando estado y enviando notificaciones', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

      if (!tieneFalta) {
        // El servidor marca la falta, envía el correo y lo registra en el historial.
        const { correo } = await notificarPrestamo("marcar-falta", item.id);
        Swal.fire({ title: '¡Falta marcada!', text: `Correo enviado a ${correo}`, icon: 'success', timer: 3000, showConfirmButton: false });
      } else {
        // alerta_enviada sigue en true: el aviso ya se envió y la revisión
        // automática no debe volver a marcar este préstamo.
        await updateEquipo(item.id, { estado: "Prestado", alerta_enviada: true });
        await addHistorial({ idEquipo: item.id, nombreEquipo: item.nombre, accion: "FALTA RETIRADA", fecha: new Date(), admin: userData?.nombre || "Admin" });
        Swal.fire({ title: '¡Falta retirada!', text: 'El equipo ha vuelto a Prestado.', icon: 'success', timer: 2500, showConfirmButton: false });
      }
    } catch (error) {
      console.error("Error en handleToggleFalta:", error);
      Swal.fire('No se pudo actualizar la falta', mensajeDeError(error), 'error');
    }
  };

  // --- NUEVO: FUNCIÓN SÓLO PARA REENVIAR CORREO ---
  const handleResendEmail = async (item) => {
    const result = await Swal.fire({
      title: '¿Reenviar correo de advertencia?',
      text: `Se enviará un recordatorio nuevamente por correo para "${item.nombre}".`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#1976d2',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, reenviar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
      Swal.fire({ title: 'Enviando correo...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

      // El servidor envía el correo y registra el reenvío en el historial.
      const { correo: correoAlumno } = await notificarPrestamo("reenviar-correo", item.id);

      Swal.fire({ title: '¡Correo Enviado!', text: `El recordatorio llegó a ${correoAlumno}`, icon: 'success', timer: 3000, showConfirmButton: false });

    } catch (error) {
      console.error("Error al reenviar el correo:", error);
      Swal.fire('No se pudo enviar el correo', mensajeDeError(error), 'error');
    }
  };

  const tarjetas = [
    { clave: "total", etiqueta: "Total", icono: "📦", valor: metrics.total },
    { clave: "disponibles", etiqueta: "Disponibles", icono: "✅", valor: metrics.disponibles },
    { clave: "prestados", etiqueta: "Prestados", icono: "🔄", valor: metrics.prestados },
    { clave: "faltas", etiqueta: "Faltas", icono: "⚠️", valor: metrics.faltas },
  ];

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">

        {/* HEADER */}
        <header className="pagina-encabezado dashboard-encabezado">
          <div>
            <h1 className="pagina-titulo">Panel de Control</h1>
            <p className="pagina-subtitulo">Bienvenido, <b>{userData?.nombre}</b></p>
          </div>
          <div className="dashboard-encabezado__extras">
            <div className="dashboard-fecha">Hoy: {new Date().toLocaleDateString()}</div>
            <button
              type="button"
              onClick={toggleTheme}
              className="dashboard-tema"
              aria-label={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          </div>
        </header>

        {/* METRICAS RAPIDAS */}
        <div className="dashboard-metricas">
          {tarjetas.map((tarjeta) => (
            <div key={tarjeta.clave} className="dashboard-metrica">
              <div className={`dashboard-metrica__icono dashboard-metrica__icono--${tarjeta.clave}`} aria-hidden="true">
                {tarjeta.icono}
              </div>
              <div>
                <p className="dashboard-metrica__etiqueta">{tarjeta.etiqueta}</p>
                <h3 className="dashboard-metrica__valor">{tarjeta.valor}</h3>
              </div>
            </div>
          ))}
        </div>

        {/* SECCIÓN ESTADÍSTICAS */}
        <h2 className="dashboard-seccion">Métricas de Uso</h2>
        <div className="dashboard-graficas">
          <div className="tarjeta dashboard-grafica">
            <h3 className="dashboard-grafica__titulo">Top 5: Equipos más pedidos <small>(últimos {DIAS_HISTORIAL_DASHBOARD} días)</small></h3>
            <div className="dashboard-grafica__lienzo">
              <ResponsiveContainer>
                <BarChart data={topEquipos}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="equipo" tick={{fill: 'var(--text-color)', fontSize: 10}} />
                  <YAxis tick={{fill: 'var(--text-color)'}} />
                  <Tooltip contentStyle={{backgroundColor: 'var(--card-bg)', borderRadius: '10px'}} />
                  <Bar dataKey="prestamos" fill="#1976d2" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="tarjeta dashboard-grafica">
            <h3 className="dashboard-grafica__titulo">Horarios Pico (Préstamos) <small>(últimos {DIAS_HISTORIAL_DASHBOARD} días)</small></h3>
            <div className="dashboard-grafica__lienzo">
              <ResponsiveContainer>
                <LineChart data={horariosPico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="hora" tick={{fill: 'var(--text-color)'}} />
                  <YAxis tick={{fill: 'var(--text-color)'}} />
                  <Tooltip contentStyle={{backgroundColor: 'var(--card-bg)', borderRadius: '10px'}} />
                  <Line type="monotone" dataKey="cantidad" stroke="#ad1457" strokeWidth={3} dot={{r:4}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* GRAFICAS DE ESTADO E INVENTARIO */}
        <div className="dashboard-graficas">
          <div className="tarjeta dashboard-grafica">
            <h3 className="dashboard-grafica__titulo">Distribución de Estados</h3>
            <div className="dashboard-grafica__lienzo">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusData} innerRadius={60} outerRadius={80} dataKey="value" nameKey="name">
                    {statusData.map((e, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="tarjeta dashboard-grafica">
            <h3 className="dashboard-grafica__titulo">Equipos por Categoría</h3>
            <div className="dashboard-grafica__lienzo">
              <ResponsiveContainer>
                <BarChart data={categoryData}>
                  <XAxis dataKey="categoria" tick={{fill: 'var(--text-color)'}}/>
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="cantidad" fill="#ff6600" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* TABLA DE PRESTADOS */}
        <div className="tarjeta">
          <h3 className="dashboard-grafica__titulo">⚠️ Equipos en Posesión ({prestadosList.length})</h3>
          <div className="tabla-scroll">
            <table className="dashboard-tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Equipo</th>
                  <th>Poseedor</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {prestadosList.map(item => {
                  const tieneFalta = item.estado?.toLowerCase() === 'no responde';
                  return (
                    <tr key={item.id}>
                      <td>{item.id_qr || item.id}</td>
                      <td>{item.nombre}</td>
                      <td>{item.poseedor_actual || "Anónimo"}</td>
                      <td>
                        <span className={`dashboard-estado${tieneFalta ? " dashboard-estado--falta" : ""}`}>
                          {item.estado}
                        </span>
                      </td>
                      <td>
                        <div className="dashboard-acciones">
                          {/* Botón principal de Falta */}
                          <button
                            type="button"
                            onClick={() => handleToggleFalta(item)}
                            className={`dashboard-accion ${tieneFalta ? "dashboard-accion--quitar" : "dashboard-accion--marcar"}`}
                          >
                            {tieneFalta ? "Quitar Falta" : "Marcar Falta"}
                          </button>

                          {/* Reenviar correo: solo cuando ya es falta */}
                          {tieneFalta && (
                            <button type="button" onClick={() => handleResendEmail(item)} className="dashboard-accion dashboard-accion--reenviar">
                              Reenviar ✉️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
