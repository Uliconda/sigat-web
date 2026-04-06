// src/pages/Dashboard.jsx
import { useState, useEffect, useContext } from "react"; 
import { collection, onSnapshot, doc, updateDoc, addDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { ThemeContext } from "../context/ThemeContext"; 
import Sidebar from "../components/Sidebar";
import emailjs from '@emailjs/browser';
import Swal from 'sweetalert2'; // <-- NUEVA IMPORTACIÓN
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
  const unsubscribe = onSnapshot(collection(db, "Equipos"), (snapshot) => {
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const disponibles = docs.filter(i => i.estado?.toLowerCase() === "disponible").length;
    const prestados = docs.filter(i => 
      ["prestado", "sin entregar"].includes(i.estado?.toLowerCase())
    ).length;
    const fueraDeServicio = docs.filter(i => i.estado?.toLowerCase() === "fuera de servicio").length;
    const faltas = docs.filter(i => i.estado?.toLowerCase() === "no responde").length;
    
    setMetrics({ total: docs.length, disponibles, prestados, fueraDeServicio, faltas });

    const equiposFuera = docs.filter(i => 
      ["prestado", "sin entregar", "no responde"].includes(i.estado?.toLowerCase())
    );
    setPrestadosList(equiposFuera);

    setStatusData([
      { name: "Disponibles", value: disponibles },
      { name: "Prestados", value: prestados },
      { name: "Fuera de Servicio", value: fueraDeServicio },
      { name: "Faltas", value: faltas }
    ]);

    const catCounts = {};
    docs.forEach(doc => {
      const cat = doc.categoria || "General"; 
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    setCategoryData(Object.keys(catCounts).map(key => ({ categoria: key, cantidad: catCounts[key] })));
  });

  return () => unsubscribe();
}, []);

// 2. ESCUCHA DE ESTADÍSTICAS (Historial)
useEffect(() => {
  const unsubscribe = onSnapshot(collection(db, "Historial"), (snapshot) => {
    const conteoEquipos = {};
    const conteoHoras = {};

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const esPrestamo = data.accion && (
          data.accion.toLowerCase().includes("préstamo") || 
          data.accion.toLowerCase().includes("prestamo")
      );

      if (esPrestamo) {
        const nombre = data.nombreEquipo || "Desconocido";
        conteoEquipos[nombre] = (conteoEquipos[nombre] || 0) + 1;

        if (data.fecha) {
          const dateObj = typeof data.fecha.toDate === 'function' ? data.fecha.toDate() : new Date(data.fecha);
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
  });

  return () => unsubscribe();
}, []);

// 3. FUNCIÓN MANEJO DE FALTAS Y CORREOS CON SWEETALERT
const handleToggleFalta = async (item) => {
  const tieneFalta = item.estado?.toLowerCase() === "no responde";
  const nuevoEstado = tieneFalta ? "Prestado" : "No responde";
  
  // Configuración del modal dependiendo de la acción
  const swalConfig = tieneFalta 
    ? {
        title: '¿Retirar Falta?',
        text: `Se quitará la marca de moroso a "${item.nombre}" y volverá a estar Prestado.`,
        icon: 'info',
        confirmButtonColor: '#28a745'
      }
    : {
        title: '¿Marcar Falta?',
        text: `Se enviará un correo automático de advertencia a quien tiene el equipo "${item.nombre}".`,
        icon: 'warning',
        confirmButtonColor: '#d33'
      };

  const result = await Swal.fire({
    ...swalConfig,
    showCancelButton: true,
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, continuar',
    cancelButtonText: 'Cancelar'
  });

  // Si el usuario cancela, detenemos la ejecución
  if (!result.isConfirmed) return;

  try {
    // Mostrar modal de "Procesando"
    Swal.fire({
      title: 'Procesando...',
      text: 'Actualizando estado y enviando notificaciones',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const equipoRef = doc(db, "Equipos", item.id);
    await updateDoc(equipoRef, { estado: nuevoEstado });

    if (!tieneFalta) {
      let matricula = "desconocido";
      if (item.matricula || item.alumno_matricula) {
        matricula = item.matricula || item.alumno_matricula;
      } else if (item.poseedor_actual) {
        const match = item.poseedor_actual.match(/\d+/);
        if (match) matricula = match;
      }

      const correoAlumno = `${matricula}@cesba-queretaro.edu.mx`;

      await addDoc(collection(db, "Historial"), {
        idEquipo: item.id,
        nombreEquipo: item.nombre,
        accion: "MARCA DE FALTA",
        fecha: new Date(),
        admin: userData?.nombre || "Admin", 
        observaciones: `Correo enviado a: ${correoAlumno}`
      });

      await emailjs.send(
        'service_mjwigqc', 
        'template_2igqgus', 
        {
          correo_destino: correoAlumno,
          nombre_alumno: item.poseedor_actual || item.alumno_nombre || 'Alumno',
          nombre_equipo: item.nombre,
          id_equipo: item.id_qr || item.id
        }, 
        'ghx5YPipRyYK0oPBG'
      );

      Swal.fire({
        title: '¡Falta marcada!',
        text: `Correo enviado exitosamente a ${correoAlumno}`,
        icon: 'success',
        timer: 3000,
        showConfirmButton: false
      });

    } else {
      await addDoc(collection(db, "Historial"), {
        idEquipo: item.id,
        nombreEquipo: item.nombre,
        accion: "FALTA RETIRADA",
        fecha: new Date(),
        admin: userData?.nombre || "Admin"
      });
      
      Swal.fire({
        title: '¡Falta retirada!',
        text: 'El equipo ha vuelto al estado Prestado.',
        icon: 'success',
        timer: 2500,
        showConfirmButton: false
      });
    }
  } catch (error) {
    console.error("Error:", error);
    Swal.fire('Error', 'Hubo un problema en el proceso. Revisa la consola para más detalles.', 'error');
  }
};

return (
  <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--bg-color)", transition: "0.3s" }}>
    <Sidebar />
    <main style={{ marginLeft: "250px", flex: 1, padding: "40px", overflowY: "auto" }}>
      
      {/* HEADER */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Panel de Control</h1>
          <p style={styles.subtitle}>Bienvenido, <b>{userData?.nombre}</b></p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={styles.dateBox}>Hoy: {new Date().toLocaleDateString()}</div>
          <button onClick={toggleTheme} style={styles.themeButton}>{theme === "light" ? "🌙" : "☀️"}</button>
        </div>
      </header>

      {/* METRICAS RAPIDAS */}
        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={{...styles.iconCircle, backgroundColor: '#e3f2fd', color: '#1976d2'}}>📦</div>
            <div><p style={styles.cardLabel}>Total</p><h3 style={styles.cardNumber}>{metrics.total}</h3></div>
          </div>
          
          <div style={styles.card}>
            <div style={{...styles.iconCircle, backgroundColor: '#e8f5e9', color: '#2e7d32'}}>✅</div>
            <div><p style={styles.cardLabel}>Disponibles</p><h3 style={styles.cardNumber}>{metrics.disponibles}</h3></div>
          </div>

          {/* --- AQUÍ REGRESAMOS LA TARJETA DE PRESTADOS --- */}
          <div style={styles.card}>
            <div style={{...styles.iconCircle, backgroundColor: '#fff3e0', color: '#ef6c00'}}>🔄</div>
            <div><p style={styles.cardLabel}>Prestados</p><h3 style={styles.cardNumber}>{metrics.prestados}</h3></div>
          </div>
          {/* ----------------------------------------------- */}

          <div style={styles.card}>
            <div style={{...styles.iconCircle, backgroundColor: '#fce4ec', color: '#ad1457'}}>⚠️</div>
            <div><p style={styles.cardLabel}>Faltas</p><h3 style={styles.cardNumber}>{metrics.faltas}</h3></div>
          </div>
        </div>

      {/* SECCIÓN ESTADÍSTICAS */}
      <h2 style={{...styles.chartTitle, marginTop: '20px'}}>Métricas de Uso</h2>
      <div style={styles.chartsContainer}>
        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Top 5: Equipos más pedidos</h3>
          <div style={{ height: 250 }}>
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

        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Horarios Pico (Préstamos)</h3>
          <div style={{ height: 250 }}>
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
      <div style={styles.chartsContainer}>
        <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Distribución de Estados</h3>
            <div style={{height: 250}}>
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
        <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Equipos por Categoría</h3>
            <div style={{height: 250}}>
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
      <div style={styles.listContainer}>
        <h3 style={styles.chartTitle}>⚠️ Equipos en Posesión ({prestadosList.length})</h3>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.theadRow}>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Equipo</th>
                <th style={styles.th}>Poseedor</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {prestadosList.map(item => (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}>{item.id_qr || item.id}</td>
                  <td style={styles.td}>{item.nombre}</td>
                  <td style={styles.td}>{item.poseedor_actual || "Anónimo"}</td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.statusBadge, 
                      backgroundColor: item.estado?.toLowerCase() === 'no responde' ? '#fce4ec' : '#fff3e0',
                      color: item.estado?.toLowerCase() === 'no responde' ? '#ad1457' : '#ef6c00'
                    }}>
                      {item.estado}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button onClick={() => handleToggleFalta(item)} style={{
                      ...styles.actionBtn,
                      backgroundColor: item.estado?.toLowerCase() === 'no responde' ? "#616161" : "#ad1457"
                    }}>
                      {item.estado?.toLowerCase() === 'no responde' ? "Quitar Falta" : "Marcar Falta"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
);
}

const styles = {
header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" },
title: { margin: 0, fontSize: "26px", color: "var(--text-color)" },
subtitle: { margin: 0, opacity: 0.7, color: "var(--text-color)" },
dateBox: { backgroundColor: "var(--card-bg)", padding: "8px 15px", borderRadius: "8px", border: "1px solid var(--border-color)", color: "var(--text-color)" },
themeButton: { background: "none", border: "1px solid var(--border-color)", borderRadius: "50%", cursor: "pointer", width: "40px", height: "40px" },
grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "20px" },
card: { backgroundColor: "var(--card-bg)", padding: "20px", borderRadius: "12px", display: "flex", alignItems: "center", gap: "15px", border: "1px solid var(--border-color)" },
iconCircle: { width: "45px", height: "45px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" },
cardLabel: { margin: 0, fontSize: "12px", opacity: 0.6, color: "var(--text-color)" },
cardNumber: { margin: 0, fontSize: "24px", color: "var(--text-color)" },
chartsContainer: { display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "20px" },
chartCard: { flex: 1, minWidth: "350px", backgroundColor: "var(--card-bg)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border-color)" },
chartTitle: { margin: "0 0 15px 0", fontSize: "16px", color: "var(--text-color)" },
listContainer: { backgroundColor: "var(--card-bg)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border-color)" },
tableWrapper: { overflowX: "auto" },
table: { width: "100%", borderCollapse: "collapse" },
theadRow: { borderBottom: "2px solid var(--border-color)", textAlign: "left" },
th: { padding: "12px", fontSize: "12px", color: "var(--text-color)", opacity: 0.6 },
tr: { borderBottom: "1px solid var(--border-color)" },
td: { padding: "12px", fontSize: "13px", color: "var(--text-color)" },
statusBadge: { padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "bold" },
actionBtn: { border: "none", color: "white", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "11px" }
};