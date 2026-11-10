// src/pages/Dashboard.tsx
import { useState, useEffect, useContext, type CSSProperties, type ReactNode } from "react";
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
import Swal, { type SweetAlertOptions } from 'sweetalert2';
import { mensajeDeError } from "../utils/errores";
import { ESTADOS, esEstado, estaFuera } from "../constants/estados";
import type { Equipo } from "../types";
import "./Dashboard.css";

import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface ConteoCategoria {
  categoria: string;
  cantidad: number;
}

interface ConteoEquipo {
  equipo: string;
  prestamos: number;
}

interface ConteoHora {
  hora: string;
  cantidad: number;
}

type ClaveEstado = "disponibles" | "prestados" | "faltas" | "fueraDeServicio";

// Un solo lugar para el nombre, color e ícono de cada estado: así las tarjetas,
// la dona y las etiquetas de la tabla usan siempre el mismo color.
const ESTADOS_DASHBOARD: { clave: ClaveEstado; etiqueta: string; icono: string; color: string }[] = [
  { clave: "disponibles", etiqueta: "Disponibles", icono: "✅", color: "#2e7d32" },
  { clave: "prestados", etiqueta: "Prestados", icono: "🔄", color: "#ef6c00" },
  { clave: "faltas", etiqueta: "Con falta", icono: "⚠️", color: "#ad1457" },
  { clave: "fueraDeServicio", etiqueta: "Fuera de servicio", icono: "🔧", color: "#757575" },
];

// Estilos comunes para que todas las gráficas se lean igual en modo claro y oscuro.
const EJE_TICK = { fill: "var(--text-muted)", fontSize: 12 };
const EJE_LINEA = { stroke: "var(--border-color)" };
const TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: "var(--card-bg)",
    border: "1px solid var(--border-color)",
    borderRadius: 10,
    color: "var(--text-color)",
  },
  labelStyle: { color: "var(--text-color)", fontWeight: 600 },
  itemStyle: { color: "var(--text-color)" },
  cursor: { fill: "var(--hover-bg)" },
};

const recortar = (texto: string, max = 18) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);
const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

function GraficaVacia({ children }: { children: ReactNode }) {
  return <div className="dashboard-vacio">{children}</div>;
}

export default function Dashboard() {
  const { userData } = useAuth();
  const { theme, toggleTheme } = useContext(ThemeContext);

  // Estados de Métricas e Inventario
  const [metrics, setMetrics] = useState<Record<ClaveEstado | "total", number>>({
    total: 0, disponibles: 0, prestados: 0, fueraDeServicio: 0, faltas: 0
  });
  const [cargando, setCargando] = useState(true);
  const [prestadosList, setPrestadosList] = useState<Equipo[]>([]);
  const [categoryData, setCategoryData] = useState<ConteoCategoria[]>([]);

  // Estados de Estadísticas (Historial)
  const [topEquipos, setTopEquipos] = useState<ConteoEquipo[]>([]);
  const [horariosPico, setHorariosPico] = useState<ConteoHora[]>([]);

  // 1. ESCUCHA DE INVENTARIO (Equipos)
  useEffect(() => {
    const unsubscribe = subscribeToEquipos((docs) => {

      // Filtramos para quedarnos ÚNICAMENTE con los equipos reales
      const equiposReales = docs.filter(item =>
        !item.isTemplate && item.nombre?.toLowerCase() !== "plantilla sistema"
      );

      const disponibles = equiposReales.filter(i => esEstado(i.estado, ESTADOS.DISPONIBLE)).length;
      const prestados = equiposReales.filter(i =>
        esEstado(i.estado, ESTADOS.PRESTADO, ESTADOS.SIN_ENTREGAR)
      ).length;
      const fueraDeServicio = equiposReales.filter(i => esEstado(i.estado, ESTADOS.FUERA_DE_SERVICIO)).length;
      const faltas = equiposReales.filter(i => esEstado(i.estado, ESTADOS.NO_RESPONDE)).length;

      setMetrics({ total: equiposReales.length, disponibles, prestados, fueraDeServicio, faltas });
      setCargando(false);

      // Equipos que alguien tiene, sin contar los ADMINISTRATIVOS.
      // Las faltas van primero porque son las que requieren atención.
      const equiposFuera = equiposReales
        .filter(i => estaFuera(i.estado) && i.categoria?.toUpperCase() !== "ADMINISTRATIVOS")
        .sort((a, b) =>
          Number(esEstado(b.estado, ESTADOS.NO_RESPONDE)) - Number(esEstado(a.estado, ESTADOS.NO_RESPONDE))
        );
      setPrestadosList(equiposFuera);

      const catCounts: Record<string, number> = {};
      equiposReales.forEach(equipo => {
        const cat = equipo.categoria || "General";
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
      setCategoryData(
        Object.keys(catCounts)
          .map(key => ({ categoria: key, cantidad: catCounts[key] }))
          .sort((a, b) => b.cantidad - a.cantidad)
      );
    }, (error) => {
      console.error("Error al cargar equipos desde Supabase:", error);
      setCargando(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. ESCUCHA DE ESTADÍSTICAS (Historial)
  useEffect(() => {
    const unsubscribe = subscribeToHistorial((historial) => {
      const conteoEquipos: Record<string, number> = {};
      const conteoHoras: Record<number, number> = {};

      historial.forEach(data => {
        const accion = data.accion?.toLowerCase() ?? "";
        if (!accion.includes("préstamo") && !accion.includes("prestamo")) return;

        const nombre = data.nombreEquipo || "Desconocido";
        conteoEquipos[nombre] = (conteoEquipos[nombre] || 0) + 1;

        if (data.fecha) {
          const fecha = new Date(data.fecha);
          if (!Number.isNaN(fecha.getTime())) {
            const hora = fecha.getHours();
            conteoHoras[hora] = (conteoHoras[hora] || 0) + 1;
          }
        }
      });

      setTopEquipos(
        Object.keys(conteoEquipos)
          .map(key => ({ equipo: key, prestamos: conteoEquipos[key] }))
          .sort((a, b) => b.prestamos - a.prestamos)
          .slice(0, 5)
      );

      // Se rellenan las horas sin préstamos con 0 para que la gráfica no "salte" horas.
      const horasConDatos = Object.keys(conteoHoras).map(Number);
      if (horasConDatos.length === 0) {
        setHorariosPico([]);
      } else {
        const desde = Math.min(...horasConDatos);
        const hasta = Math.max(...horasConDatos);
        const horas: ConteoHora[] = [];
        for (let h = desde; h <= hasta; h++) {
          horas.push({ hora: `${String(h).padStart(2, "0")}:00`, cantidad: conteoHoras[h] || 0 });
        }
        setHorariosPico(horas);
      }
    }, (error) => console.error("Error al cargar historial desde Supabase:", error));

    return () => unsubscribe();
  }, []);


  // Los préstamos vencidos (48 h) los revisa el servidor cada hora con pg_cron:
  // ver supabase/functions/notificaciones-prestamos y supabase/cron/alertas-prestamos.sql.

  // 3. FUNCIÓN MANEJO DE FALTAS MANUALES
  const handleToggleFalta = async (item: Equipo) => {
    const tieneFalta = esEstado(item.estado, ESTADOS.NO_RESPONDE);

    const swalConfig: SweetAlertOptions = tieneFalta
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
        await updateEquipo(item.id, { estado: ESTADOS.PRESTADO, alerta_enviada: true });
        await addHistorial({ idEquipo: item.id, nombreEquipo: item.nombre, accion: "FALTA RETIRADA", fecha: new Date(), admin: userData?.nombre || "Admin" });
        Swal.fire({ title: '¡Falta retirada!', text: 'El equipo ha vuelto a Prestado.', icon: 'success', timer: 2500, showConfirmButton: false });
      }
    } catch (error) {
      console.error("Error en handleToggleFalta:", error);
      Swal.fire('No se pudo actualizar la falta', mensajeDeError(error), 'error');
    }
  };

  // --- FUNCIÓN SÓLO PARA REENVIAR CORREO ---
  const handleResendEmail = async (item: Equipo) => {
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

  const valorTarjeta = (valor: number) => (cargando ? "—" : valor);
  const datosDona = ESTADOS_DASHBOARD
    .map(e => ({ ...e, valor: metrics[e.clave] }))
    .filter(e => e.valor > 0);
  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const periodo = `últimos ${DIAS_HISTORIAL_DASHBOARD} días`;

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
            <div className="dashboard-fecha">📅 {hoy}</div>
            <button
              type="button"
              onClick={toggleTheme}
              className="dashboard-tema"
              aria-label={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
              title={theme === "light" ? "Modo oscuro" : "Modo claro"}
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          </div>
        </header>

        {/* CONTADOR DE EQUIPOS */}
        <h2 className="dashboard-seccion">Inventario</h2>
        <div className="dashboard-metricas">
          <div className="dashboard-metrica dashboard-metrica--total">
            <div className="dashboard-metrica__icono" aria-hidden="true">📦</div>
            <div>
              <p className="dashboard-metrica__etiqueta">Total de equipos</p>
              <p className="dashboard-metrica__valor">{valorTarjeta(metrics.total)}</p>
              <p className="dashboard-metrica__detalle">registrados en el sistema</p>
            </div>
          </div>
          {ESTADOS_DASHBOARD.map((estado) => (
            <div
              key={estado.clave}
              className="dashboard-metrica"
              style={{ "--metrica-color": estado.color } as CSSProperties}
            >
              <div className="dashboard-metrica__icono" aria-hidden="true">{estado.icono}</div>
              <div>
                <p className="dashboard-metrica__etiqueta">{estado.etiqueta}</p>
                <p className="dashboard-metrica__valor">{valorTarjeta(metrics[estado.clave])}</p>
                <p className="dashboard-metrica__detalle">
                  {cargando ? " " : `${porcentaje(metrics[estado.clave], metrics.total)}% del total`}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* GRAFICAS DE ESTADO E INVENTARIO */}
        <div className="dashboard-graficas">
          <section className="tarjeta dashboard-grafica">
            <h3 className="dashboard-grafica__titulo">¿Cómo están los equipos?</h3>
            <p className="dashboard-grafica__ayuda">Estado actual de todo el inventario.</p>
            {datosDona.length === 0 ? (
              <GraficaVacia>{cargando ? "Cargando…" : "Aún no hay equipos registrados."}</GraficaVacia>
            ) : (
              <div className="dashboard-dona">
                <div className="dashboard-dona__grafica">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={datosDona}
                        innerRadius="68%"
                        outerRadius="95%"
                        dataKey="valor"
                        nameKey="etiqueta"
                        paddingAngle={datosDona.length > 1 ? 2 : 0}
                        stroke="var(--card-bg)"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {datosDona.map((e) => <Cell key={e.clave} fill={e.color} />)}
                      </Pie>
                      <Tooltip {...TOOLTIP_PROPS} formatter={(valor) => [`${valor} equipos`, ""]} separator="" />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="dashboard-dona__centro" aria-hidden="true">
                    <strong>{metrics.total}</strong>
                    <span>equipos</span>
                  </div>
                </div>
                <ul className="dashboard-leyenda">
                  {ESTADOS_DASHBOARD.map((e) => (
                    <li key={e.clave}>
                      <span className="dashboard-leyenda__punto" style={{ background: e.color }} />
                      <span className="dashboard-leyenda__nombre">{e.etiqueta}</span>
                      <span className="dashboard-leyenda__valor">{metrics[e.clave]}</span>
                      <span className="dashboard-leyenda__pct">{porcentaje(metrics[e.clave], metrics.total)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="tarjeta dashboard-grafica">
            <h3 className="dashboard-grafica__titulo">Equipos por categoría</h3>
            <p className="dashboard-grafica__ayuda">Cuántos equipos hay de cada tipo.</p>
            {categoryData.length === 0 ? (
              <GraficaVacia>{cargando ? "Cargando…" : "Sin categorías para mostrar."}</GraficaVacia>
            ) : (
              <div className="dashboard-grafica__lienzo" style={{ height: Math.max(200, categoryData.length * 40 + 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                    <XAxis type="number" allowDecimals={false} tick={EJE_TICK} axisLine={EJE_LINEA} tickLine={false} />
                    <YAxis type="category" dataKey="categoria" width={130} tick={EJE_TICK} tickFormatter={(v) => recortar(String(v))} axisLine={EJE_LINEA} tickLine={false} />
                    <Tooltip {...TOOLTIP_PROPS} formatter={(valor) => [`${valor} equipos`, "Cantidad"]} />
                    <Bar dataKey="cantidad" fill="#ff6f00" radius={[0, 4, 4, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>

        {/* SECCIÓN ESTADÍSTICAS */}
        <h2 className="dashboard-seccion">Uso de los equipos <small>({periodo})</small></h2>
        <div className="dashboard-graficas">
          <section className="tarjeta dashboard-grafica">
            <h3 className="dashboard-grafica__titulo">Top 5: equipos más pedidos</h3>
            <p className="dashboard-grafica__ayuda">Número de préstamos por equipo.</p>
            {topEquipos.length === 0 ? (
              <GraficaVacia>Todavía no hay préstamos en este periodo.</GraficaVacia>
            ) : (
              <div className="dashboard-grafica__lienzo">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topEquipos} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                    <XAxis type="number" allowDecimals={false} tick={EJE_TICK} axisLine={EJE_LINEA} tickLine={false} />
                    <YAxis type="category" dataKey="equipo" width={130} tick={EJE_TICK} tickFormatter={(v) => recortar(String(v))} axisLine={EJE_LINEA} tickLine={false} />
                    <Tooltip {...TOOLTIP_PROPS} formatter={(valor) => [`${valor} préstamos`, "Total"]} />
                    <Bar dataKey="prestamos" fill="#1976d2" radius={[0, 4, 4, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="tarjeta dashboard-grafica">
            <h3 className="dashboard-grafica__titulo">Horarios con más préstamos</h3>
            <p className="dashboard-grafica__ayuda">A qué hora del día se piden más equipos.</p>
            {horariosPico.length === 0 ? (
              <GraficaVacia>Todavía no hay préstamos en este periodo.</GraficaVacia>
            ) : (
              <div className="dashboard-grafica__lienzo">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={horariosPico} margin={{ right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="hora" tick={EJE_TICK} axisLine={EJE_LINEA} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis allowDecimals={false} tick={EJE_TICK} axisLine={EJE_LINEA} tickLine={false} width={36} />
                    <Tooltip {...TOOLTIP_PROPS} formatter={(valor) => [`${valor} préstamos`, "Total"]} />
                    <Bar dataKey="cantidad" fill="#ad1457" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>

        {/* TABLA DE PRESTADOS */}
        <section className="tarjeta">
          <h3 className="dashboard-grafica__titulo">Equipos prestados ahora ({prestadosList.length})</h3>
          <p className="dashboard-grafica__ayuda">Quién tiene cada equipo. Los que tienen falta aparecen primero.</p>
          {prestadosList.length === 0 ? (
            <GraficaVacia>✅ No hay equipos prestados en este momento.</GraficaVacia>
          ) : (
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
                    const tieneFalta = esEstado(item.estado, ESTADOS.NO_RESPONDE);
                    return (
                      <tr key={item.id} className={tieneFalta ? "dashboard-tabla__fila--falta" : undefined}>
                        <td className="dashboard-tabla__id">{item.id_qr || item.id}</td>
                        <td>{item.nombre}</td>
                        <td>{item.poseedor_actual || "Anónimo"}</td>
                        <td>
                          <span className={`dashboard-estado${tieneFalta ? " dashboard-estado--falta" : ""}`}>
                            {tieneFalta ? "⚠️ Con falta" : item.estado}
                          </span>
                        </td>
                        <td>
                          <div className="dashboard-acciones">
                            <button
                              type="button"
                              onClick={() => handleToggleFalta(item)}
                              className={`dashboard-accion ${tieneFalta ? "dashboard-accion--quitar" : "dashboard-accion--marcar"}`}
                            >
                              {tieneFalta ? "Quitar falta" : "Marcar falta"}
                            </button>

                            {/* Reenviar correo: solo cuando ya es falta */}
                            {tieneFalta && (
                              <button type="button" onClick={() => handleResendEmail(item)} className="dashboard-accion dashboard-accion--reenviar">
                                ✉️ Reenviar correo
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
          )}
        </section>
      </main>
    </div>
  );
}
