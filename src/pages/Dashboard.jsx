// src/pages/Dashboard.jsx
import { useState, useEffect, useContext } from "react"; 
import { collection, onSnapshot, doc, updateDoc, addDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { ThemeContext } from "../context/ThemeContext"; 
import Sidebar from "../components/Sidebar";
import emailjs from '@emailjs/browser'; // <-- NUEVA IMPORTACIÓN
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";

export default function Dashboard() {
  const { userData } = useAuth();
  const { theme, toggleTheme } = useContext(ThemeContext); 

  const [metrics, setMetrics] = useState({ 
    total: 0, disponibles: 0, prestados: 0, fueraDeServicio: 0, faltas: 0 
  });

  const [prestadosList, setPrestadosList] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);

  const STATUS_COLORS = ["#2e7d32", "#c62828", "#616161", "#ad1457"];

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "Equipos"), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const disponibles = docs.filter(i => i.estado?.toLowerCase() === "disponible").length;
      const prestados = docs.filter(i => 
        i.estado?.toLowerCase() === "prestado" || 
        i.estado?.toLowerCase() === "sin entregar"
      ).length;
      const fueraDeServicio = docs.filter(i => i.estado?.toLowerCase() === "fuera de servicio").length;
      const faltas = docs.filter(i => i.estado?.toLowerCase() === "no responde").length;
      
      setMetrics({ total: docs.length, disponibles, prestados, fueraDeServicio, faltas });

      const equiposFuera = docs.filter(i => 
        i.estado?.toLowerCase() === "prestado" || 
        i.estado?.toLowerCase() === "sin entregar" ||
        i.estado?.toLowerCase() === "no responde"
      );
      setPrestadosList(equiposFuera);

      setStatusData([
        { name: "Disponibles", value: disponibles },
        { name: "Prestados/Sin Entregar", value: prestados },
        { name: "Fuera de Servicio", value: fueraDeServicio },
        { name: "Faltas (Usuarios)", value: faltas }
      ]);

      const catCounts = {};
      docs.forEach(doc => {
        const cat = doc.categoria || "General"; 
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });

      const barData = Object.keys(catCounts).map(key => ({
        categoria: key,
        cantidad: catCounts[key]
      }));
      
      setCategoryData(barData);
    });

    return () => unsubscribe();
  }, []);

  // --- FUNCIÓN ACTUALIZADA CON EMAILJS ---
  const handleToggleFalta = async (item) => {
    const tieneFalta = item.estado?.toLowerCase() === "no responde";
    const nuevoEstado = tieneFalta ? "Prestado" : "No responde";
    const mensajeConfirmacion = tieneFalta 
      ? `¿Estás seguro de quitar la falta a ${item.nombre} y regresarlo a 'Prestado'?` 
      : `¿Confirmas marcar FALTA para el equipo ${item.nombre}? Se enviará un correo automático al alumno.`;

    const confirmacion = window.confirm(mensajeConfirmacion);
    if (confirmacion) {
      try {
        // 1. Actualizar el estado del equipo en Firebase
        const equipoRef = doc(db, "Equipos", item.id);
        await updateDoc(equipoRef, { estado: nuevoEstado });

        // 2. Lógica si se está MARCANDO la falta (Enviar correo vía EmailJS)
        if (!tieneFalta) {
          const matricula = item.matricula || item.alumno_matricula || "desconocido";
          const correoAlumno = `${matricula}@cesba-queretaro.edu.mx`;
          const nombreAlumno = item.poseedor_actual || item.alumno_nombre || 'Alumno';

          // A) Registrar en Historial
          await addDoc(collection(db, "Historial"), {
            idEquipo: item.id,
            nombreEquipo: item.nombre,
            accion: "FALTA",
            fecha: new Date().toISOString(),
            admin: userData?.nombre || "Admin", 
            observaciones: `Se marcó como no responde. Correo enviado a: ${correoAlumno}`
          });

          // B) Enviar el correo usando EmailJS
          const templateParams = {
            correo_destino: correoAlumno,
            nombre_alumno: nombreAlumno,
            nombre_equipo: item.nombre,
            id_equipo: item.id_qr || item.id
          };

          // REEMPLAZA ESTAS CREDENCIALES CON LAS DE TU CUENTA DE EMAILJS
          await emailjs.send(
            'service_mjwigqc', 
            'template_2igqgus', 
            templateParams, 
            'ghx5YPipRyYK0oPBG'
          );

          alert(`Falta marcada exitosamente. Correo enviado a ${correoAlumno}`);
        } else {
          // Lógica si se está QUITANDO la falta
          await addDoc(collection(db, "Historial"), {
            idEquipo: item.id,
            nombreEquipo: item.nombre,
            accion: "FALTA RETIRADA",
            fecha: new Date().toISOString(),
            admin: userData?.nombre || "Admin", 
            observaciones: `Se retiró la marca de moroso. El equipo volvió a estado Prestado.`
          });
          alert("Falta retirada. El estado volvió a 'Prestado'.");
        }

      } catch (error) {
        console.error("Error al procesar la falta o enviar correo: ", error);
        alert("Hubo un problema al procesar la solicitud. Revisa la consola.");
      }
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--bg-color)", transition: "0.3s" }}>
      <Sidebar />
      
      <main style={{ marginLeft: "250px", flex: 1, padding: "40px", overflowY: "auto" }}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Panel de Control</h1>
            <p style={styles.subtitle}>Bienvenido de nuevo, <b>{userData?.nombre}</b></p>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <div style={styles.dateBox}>Hoy: {new Date().toLocaleDateString()}</div>
            <button onClick={toggleTheme} style={styles.themeButton} title="Cambiar tema">
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          </div>
        </header>

        {/* TARJETAS DE MÉTRICAS */}
        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={{...styles.iconCircle, backgroundColor: '#e3f2fd', color: '#1976d2'}}>📦</div>
            <div>
              <p style={styles.cardLabel}>Total Equipos</p>
              <h3 style={styles.cardNumber}>{metrics.total}</h3>
            </div>
          </div>
          <div style={styles.card}>
            <div style={{...styles.iconCircle, backgroundColor: '#e8f5e9', color: '#2e7d32'}}>✅</div>
            <div>
              <p style={styles.cardLabel}>Disponibles</p>
              <h3 style={styles.cardNumber}>{metrics.disponibles}</h3>
            </div>
          </div>
          <div style={styles.card}>
            <div style={{...styles.iconCircle, backgroundColor: '#eeeeee', color: '#616161'}}>🚫</div>
            <div>
              <p style={styles.cardLabel}>Baja / Rotos</p>
              <h3 style={styles.cardNumber}>{metrics.fueraDeServicio}</h3>
            </div>
          </div>
          <div style={styles.card}>
            <div style={{...styles.iconCircle, backgroundColor: '#fce4ec', color: '#ad1457'}}>👤</div>
            <div>
              <p style={styles.cardLabel}>Faltas (Usuarios)</p>
              <h3 style={styles.cardNumber}>{metrics.faltas}</h3>
            </div>
          </div>
        </div>

        {/* SECCIÓN DE GRÁFICAS */}
        <div style={styles.chartsContainer}>
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Estado Actual del Inventario</h3>
            <div style={{ height: 300, width: "100%" }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={statusData} cx="50%" cy="50%" innerRadius={70} outerRadius={100}
                    paddingAngle={5} dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--card-bg)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '10px' }}
                    itemStyle={{ color: 'var(--text-color)' }}
                    formatter={(value) => [`${value} equipos`, "Cantidad"]} 
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: 'var(--text-color)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Equipos por Categoría</h3>
            <div style={{ height: 300, width: "100%" }}>
              <ResponsiveContainer>
                <BarChart data={categoryData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="categoria" tick={{ fill: 'var(--text-color)' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--text-color)' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: theme === 'dark' ? '#333' : '#f5f5f5'}}
                    contentStyle={{ backgroundColor: 'var(--card-bg)', color: 'var(--text-color)', borderRadius: '10px', border: '1px solid var(--border-color)' }}
                  />
                  <Bar dataKey="cantidad" fill="#ff6600" radius={5} barSize={40} name="Cantidad" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* --- LISTA DE EQUIPOS PRESTADOS --- */}
        <div style={styles.listContainer}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={styles.chartTitle}>⚠️ Equipos Prestados / Sin Entregar ({prestadosList.length})</h3>
          </div>
          
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={styles.th}>ID Equipo</th>
                  <th style={styles.th}>Nombre</th>
                  <th style={styles.th}>Estado</th>
                  <th style={styles.th}>Poseedor Actual</th>
                  <th style={styles.th}>Fecha Préstamo</th>
                  <th style={styles.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {prestadosList.length > 0 ? (
                  prestadosList.map(item => (
                    <tr key={item.id} style={styles.tr}>
                      <td style={styles.td}><b>{item.id || item.id_qr}</b></td>
                      <td style={styles.td}>{item.nombre}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge, 
                          backgroundColor: item.estado?.toLowerCase() === 'no responde' ? '#fce4ec' : '#ffebee', 
                          color: item.estado?.toLowerCase() === 'no responde' ? '#ad1457' : '#c62828'
                        }}>
                          {item.estado || "Prestado"}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {item.poseedor_actual || item.alumno_nombre || "Desconocido"}
                      </td>
                      <td style={styles.td}>
                        {item.fecha_prestamo 
                          ? new Date(item.fecha_prestamo).toLocaleDateString() 
                          : "No registrada"}
                      </td>
                      <td style={styles.td}>
                        <button 
                          onClick={() => handleToggleFalta(item)}
                          style={{
                            backgroundColor: item.estado?.toLowerCase() === 'no responde' ? "#616161" : "#ad1457",
                            color: "white",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "bold",
                            transition: "0.2s"
                          }}
                        >
                          {item.estado?.toLowerCase() === 'no responde' ? "Quitar Falta" : "Marcar Falta"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{...styles.td, textAlign: "center", padding: "30px", opacity: 0.6}}>
                      ¡Todo en orden! No hay equipos prestados ni sin entregar en este momento. 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}

const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" },
  title: { margin: 0, fontSize: "28px", color: "var(--text-color)" },
  subtitle: { margin: "5px 0 0 0", color: "var(--text-color)", opacity: 0.7 },
  dateBox: { backgroundColor: "var(--card-bg)", color: "var(--text-color)", border: `1px solid var(--border-color)`, padding: "10px 20px", borderRadius: "10px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", fontWeight: "500", transition: "0.3s" },
  themeButton: { backgroundColor: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "50%", width: "45px", height: "45px", fontSize: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "0.3s" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "25px", marginBottom: "30px" },

  card: { backgroundColor: "var(--card-bg)", padding: "25px", borderRadius: "15px", display: "flex", alignItems: "center", gap: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", border: "1px solid var(--border-color)", transition: "0.3s" },
  iconCircle: { width: "50px", height: "50px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" },
  cardLabel: { margin: 0, color: "var(--text-color)", opacity: 0.7, fontSize: "14px", fontWeight: "600", textTransform: "uppercase" },
  cardNumber: { margin: 0, fontSize: "32px", color: "var(--text-color)" },

  chartsContainer: { display: "flex", gap: "25px", flexWrap: "wrap", marginBottom: "30px" },
  chartCard: { flex: 1, minWidth: "400px", backgroundColor: "var(--card-bg)", padding: "30px", borderRadius: "15px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", border: "1px solid var(--border-color)", transition: "0.3s" },
  chartTitle: { margin: "0 0 20px 0", color: "var(--text-color)", fontSize: "18px", fontWeight: "600" },

  listContainer: { backgroundColor: "var(--card-bg)", padding: "30px", borderRadius: "15px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", border: "1px solid var(--border-color)", transition: "0.3s" },
  tableWrapper: { maxHeight: "350px", overflowY: "auto", borderRadius: "8px", border: "1px solid var(--border-color)" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  theadRow: { backgroundColor: "var(--bg-color)", position: "sticky", top: 0, zIndex: 1, borderBottom: "2px solid var(--border-color)" },
  th: { padding: "15px 20px", fontSize: "13px", color: "var(--text-color)", opacity: 0.7, fontWeight: "700", textTransform: "uppercase" },
  tr: { borderBottom: "1px solid var(--border-color)", transition: "0.2s" },
  td: { padding: "15px 20px", color: "var(--text-color)", fontSize: "14px" },
  statusBadge: { padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase" }
};