// src/pages/Dashboard.jsx
import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
// Importamos los componentes de Recharts
import { 
PieChart, Pie, Cell, 
BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";

export default function Dashboard() {
const { userData } = useAuth();

// Métricas numéricas actualizadas con "fueraDeServicio"
const [metrics, setMetrics] = useState({ total: 0, disponibles: 0, prestados: 0, fueraDeServicio: 0 });

// Datos para las gráficas
const [statusData, setStatusData] = useState([]);
const [categoryData, setCategoryData] = useState([]);

// Colores para la gráfica de dona (Verde: Disponible, Rojo: Prestado, Gris: Fuera de Servicio)
const STATUS_COLORS = ["#2e7d32", "#c62828", "#616161"];

useEffect(() => {
const unsubscribe = onSnapshot(collection(db, "Equipos"), (snapshot) => {
    const docs = snapshot.docs.map(doc => doc.data());
    
    // 1. Calculamos las métricas básicas (Añadimos Fuera de Servicio)
    const disponibles = docs.filter(i => i.estado?.toLowerCase() === "disponible").length;
    const prestados = docs.filter(i => i.estado?.toLowerCase() === "prestado").length;
    const fueraDeServicio = docs.filter(i => i.estado?.toLowerCase() === "fuera de servicio").length;
    
    setMetrics({
    total: docs.length,
    disponibles,
    prestados,
    fueraDeServicio
    });

    // 2. Preparamos datos para la Gráfica de Dona (Estado)
    setStatusData([
    { name: "Disponibles", value: disponibles },
    { name: "Prestados", value: prestados },
    { name: "Fuera de Servicio", value: fueraDeServicio }
    ]);

    // 3. Preparamos datos para la Gráfica de Barras (Categorías)
    const catCounts = {};
    docs.forEach(doc => {
    const cat = doc.categoria || "General"; 
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    // Convertimos el objeto en un arreglo para Recharts
    const barData = Object.keys(catCounts).map(key => ({
    categoria: key,
    cantidad: catCounts[key]
    }));
    
    setCategoryData(barData);
});

return () => unsubscribe();
}, []);

return (
<div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
    <Sidebar />
    
    <main style={{ marginLeft: "250px", flex: 1, padding: "40px" }}>
    <header style={styles.header}>
        <div>
        <h1 style={styles.title}>Panel de Control</h1>
        <p style={styles.subtitle}>Bienvenido de nuevo, <b>{userData?.nombre}</b></p>
        </div>
        <div style={styles.dateBox}>Hoy: {new Date().toLocaleDateString()}</div>
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
        <div style={{...styles.iconCircle, backgroundColor: '#ffebee', color: '#c62828'}}>📤</div>
        <div>
            <p style={styles.cardLabel}>Prestados</p>
            <h3 style={styles.cardNumber}>{metrics.prestados}</h3>
        </div>
        </div>
        {/* NUEVA TARJETA: FUERA DE SERVICIO */}
        <div style={styles.card}>
        <div style={{...styles.iconCircle, backgroundColor: '#eeeeee', color: '#616161'}}>🚫</div>
        <div>
            <p style={styles.cardLabel}>Baja / Rotos</p>
            <h3 style={styles.cardNumber}>{metrics.fueraDeServicio}</h3>
        </div>
        </div>
    </div>

    {/* SECCIÓN DE GRÁFICAS */}
    <div style={styles.chartsContainer}>
        
        {/* Gráfica 1: Estado de los Equipos (Dona) */}
        <div style={styles.chartCard}>
        <h3 style={styles.chartTitle}>Estado Actual del Inventario</h3>
        <div style={{ height: 300, width: "100%" }}>
            <ResponsiveContainer>
            <PieChart>
                <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                >
                {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} equipos`, "Cantidad"]} />
                <Legend verticalAlign="bottom" height={36} />
            </PieChart>
            </ResponsiveContainer>
        </div>
        </div>

        {/* Gráfica 2: Equipos por Categoría (Barras) */}
        <div style={styles.chartCard}>
        <h3 style={styles.chartTitle}>Equipos por Categoría</h3>
        <div style={{ height: 300, width: "100%" }}>
            <ResponsiveContainer>
            <BarChart
                data={categoryData}
                margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="categoria" tick={{ fill: '#666' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#666' }} axisLine={false} tickLine={false} />
                <Tooltip 
                cursor={{fill: '#f5f5f5'}}
                contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="cantidad" fill="#ff6600" radius={[6, 6, 0, 0]} barSize={40} name="Cantidad de Equipos" />
            </BarChart>
            </ResponsiveContainer>
        </div>
        </div>

    </div>
    </main>
</div>
);
}

// Estilos actualizados
const styles = {
header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" },
title: { margin: 0, fontSize: "28px", color: "#1a1a1a" },
subtitle: { margin: "5px 0 0 0", color: "#666" },
dateBox: { backgroundColor: "#fff", padding: "10px 20px", borderRadius: "10px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", fontWeight: "500" },
// Actualizado de 3 a 4 columnas
grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "25px", marginBottom: "30px" },
card: { backgroundColor: "#fff", padding: "25px", borderRadius: "15px", display: "flex", alignItems: "center", gap: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", border: "1px solid #f0f0f0" },
iconCircle: { width: "50px", height: "50px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" },
cardLabel: { margin: 0, color: "#888", fontSize: "14px", fontWeight: "600", textTransform: "uppercase" },
cardNumber: { margin: 0, fontSize: "32px", color: "#333" },

chartsContainer: { display: "flex", gap: "25px", flexWrap: "wrap" },
chartCard: { flex: 1, minWidth: "400px", backgroundColor: "#fff", padding: "30px", borderRadius: "15px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", border: "1px solid #f0f0f0" },
chartTitle: { margin: "0 0 20px 0", color: "#444", fontSize: "18px", fontWeight: "600" }
};