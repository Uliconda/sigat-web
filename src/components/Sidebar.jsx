// src/components/Sidebar.jsx
import { useContext, useEffect, useState } from "react"; 
import { useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../config/firebase"; // Asegúrate de importar db
import { collection, onSnapshot } from "firebase/firestore"; // Importamos para leer en tiempo real
import { ThemeContext } from "../context/ThemeContext"; 
import logo from '../assets/assets_buho.png'; 

export default function Sidebar() {
const navigate = useNavigate();
const location = useLocation();
const { theme } = useContext(ThemeContext); 

// Nuevo estado para contar las alertas urgentes
const [urgentCount, setUrgentCount] = useState(0);

// Escuchar en tiempo real los equipos para calcular mantenimientos urgentes
useEffect(() => {
const unsubscribe = onSnapshot(collection(db, "Equipos"), (snapshot) => {
    let count = 0;
    snapshot.forEach((doc) => {
    const data = doc.data();
    const dateVal = data.fecha_revision || data.lastCheck;
    
    if (dateVal) {
        const date = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
        const diffMs = Date.now() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        // Si han pasado más de 90 días, lo contamos como urgente
        if (diffDays > 90) {
        count++;
        }
    }
    });
    setUrgentCount(count);
});

return () => unsubscribe();
}, []);

const menuItems = [
{ name: "Dashboard", path: "/dashboard", icon: "📊" },
{ name: "Inventario", path: "/inventario", icon: "📦" },
{ name: "Usuarios", path: "/usuarios", icon: "👥" },
{ name: "Mantenimiento", path: "/mantenimiento", icon: "🛠️" },        
];

const handleLogout = () => signOut(auth).then(() => navigate("/"));

const getActiveBgColor = (path) => {
if (location.pathname !== path) return "transparent";
return theme === "dark" ? "#333333" : "#f0f0f0";
};

return (
<>
    <div style={styles.sidebar}>
    <div style={styles.logoSection}>
        <img src={logo} alt="Logo de la Escuela" style={styles.logoImage} />
        <h2 style={styles.logoText}>SIGAT <span style={{color: '#ff6600'}}>WEB</span></h2>
    </div>
    
    <nav style={styles.nav}>
        {menuItems.map((item) => (
        <div
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
            ...styles.navItem,
            backgroundColor: getActiveBgColor(item.path), 
            borderRight: location.pathname === item.path ? "4px solid #ff6600" : "none",
            color: "var(--text-color)" 
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={styles.icon}>{item.icon}</span>
            <span style={styles.linkText}>{item.name}</span>
            </div>

            {/* Si es la pestaña de mantenimiento y hay urgencias, mostramos el badge rojo */}
            {item.name === "Mantenimiento" && urgentCount > 0 && (
            <span style={styles.badge}>{urgentCount}</span>
            )}
        </div>
        ))}
    </nav>

    <button onClick={handleLogout} style={styles.logoutBtn}>
        Cerrar Sesión
    </button>
    </div>

    {/* Notificación Flotante Global (Aparece en cualquier ventana) */}
    {urgentCount > 0 && location.pathname !== "/mantenimiento" && (
    <div 
        style={styles.floatingAlert} 
        onClick={() => navigate("/mantenimiento")}
        title="Ir a mantenimiento"
    >
        ⚠️ Tienes {urgentCount} {urgentCount === 1 ? "equipo" : "equipos"} con mantenimiento <b>URGENTE</b>.
    </div>
    )}
</>
);
}

const styles = {
sidebar: {
width: "250px",
height: "100vh",
backgroundColor: "var(--card-bg)", 
borderRight: "1px solid var(--border-color)", 
display: "flex",
flexDirection: "column",
position: "fixed",
left: 0,
top: 0,
transition: "0.3s",
zIndex: 100 
},
logoSection: {
padding: "30px 20px",
borderBottom: "1px solid var(--border-color)", 
textAlign: "center",
display: "flex",
flexDirection: "column",
alignItems: "center",
gap: "10px",
transition: "0.3s"
},
logoImage: { width: "120px", height: "auto", objectFit: "contain" },
logoText: { margin: 0, fontSize: "22px", fontWeight: "800", color: "var(--text-color)", transition: "0.3s" },
nav: { flex: 1, padding: "20px 0" },
navItem: {
display: "flex",
alignItems: "center",
justifyContent: "space-between", // Permite separar el texto del badge
padding: "15px 25px",
cursor: "pointer",
transition: "0.3s",
},
linkText: { fontSize: "16px", fontWeight: "500", color: "inherit" },
icon: { fontSize: "20px" },
badge: {
backgroundColor: "#ff4444",
color: "white",
fontSize: "12px",
fontWeight: "bold",
padding: "2px 8px",
borderRadius: "12px",
},
logoutBtn: {
margin: "20px",
padding: "12px",
backgroundColor: "transparent", 
border: "1px solid #ff6600",
color: "#ff6600",
borderRadius: "8px",
cursor: "pointer",
fontWeight: "600",
transition: "0.3s"
},
// Estilos de la notificación flotante
floatingAlert: {
position: "fixed",
bottom: "30px",
right: "30px",
backgroundColor: "#ff4444",
color: "white",
padding: "15px 20px",
borderRadius: "8px",
boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
cursor: "pointer",
zIndex: 9999, // Para que siempre esté por encima de las tablas
fontSize: "14px",
display: "flex",
alignItems: "center",
gap: "10px",
transition: "transform 0.2s",
}
};