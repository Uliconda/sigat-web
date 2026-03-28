// src/components/Sidebar.jsx
import { useContext } from "react"; // <-- Importamos useContext
import { useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../config/firebase";
import { ThemeContext } from "../context/ThemeContext"; // <-- Importamos el contexto del tema
// Asegúrate de que la imagen en tu carpeta assets se llame exactamente "assets_buho.png"
import logo from '../assets/assets_buho.png'; 

export default function Sidebar() {
const navigate = useNavigate();
const location = useLocation();
const { theme } = useContext(ThemeContext); // <-- Leemos el tema actual

// ELIMINAMOS LA OPCIÓN DE QR DE ESTE MENÚ
const menuItems = [
{ name: "Dashboard", path: "/dashboard", icon: "📊" },
{ name: "Inventario", path: "/inventario", icon: "📦" },
{ name: "Usuarios", path: "/usuarios", icon: "👥" },
];

const handleLogout = () => signOut(auth).then(() => navigate("/"));

// Función para elegir el color de fondo de la pestaña activa según el tema
const getActiveBgColor = (path) => {
if (location.pathname !== path) return "transparent";
return theme === "dark" ? "#333333" : "#f0f0f0";
};

return (
<div style={styles.sidebar}>
    <div style={styles.logoSection}>
    {/* Aquí insertamos tu logo */}
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
            backgroundColor: getActiveBgColor(item.path), // <-- Usamos la función de color
            borderRight: location.pathname === item.path ? "4px solid #ff6600" : "none",
            color: "var(--text-color)" // <-- Aseguramos que el texto respete el modo
        }}
        >
        <span style={styles.icon}>{item.icon}</span>
        <span style={styles.linkText}>{item.name}</span>
        </div>
    ))}
    </nav>

    <button onClick={handleLogout} style={styles.logoutBtn}>
    Cerrar Sesión
    </button>
</div>
);
}

const styles = {
sidebar: {
width: "250px",
height: "100vh",
backgroundColor: "var(--card-bg)", // <-- Variable en lugar de #ffffff
borderRight: "1px solid var(--border-color)", // <-- Variable en lugar de #e0e0e0
display: "flex",
flexDirection: "column",
position: "fixed",
left: 0,
top: 0,
transition: "0.3s" // <-- Transición suave
},
logoSection: {
padding: "30px 20px",
borderBottom: "1px solid var(--border-color)", // <-- Variable en lugar de #f0f0f0
textAlign: "center",
display: "flex",
flexDirection: "column",
alignItems: "center",
gap: "10px",
transition: "0.3s"
},
logoImage: {
width: "120px",
height: "auto",
objectFit: "contain"
},
logoText: { 
margin: 0, 
fontSize: "22px", 
fontWeight: "800", 
color: "var(--text-color)", // <-- Variable en lugar de #333
transition: "0.3s"
},
nav: { flex: 1, padding: "20px 0" },
navItem: {
display: "flex",
alignItems: "center",
padding: "15px 25px",
cursor: "pointer",
transition: "0.3s",
gap: "15px"
},
linkText: { 
fontSize: "16px", 
fontWeight: "500",
color: "inherit" // <-- Hereda el color que le pusimos arriba
},
icon: { fontSize: "20px" },
logoutBtn: {
margin: "20px",
padding: "12px",
backgroundColor: "transparent", // <-- Lo pasamos a transparente para que luzca bien en ambos modos
border: "1px solid #ff6600",
color: "#ff6600",
borderRadius: "8px",
cursor: "pointer",
fontWeight: "600",
transition: "0.3s"
}
};