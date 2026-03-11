// src/components/Sidebar.jsx
import { useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../config/firebase";
// Asegúrate de que la imagen en tu carpeta assets se llame exactamente "buho.png"
// (o cámbiale el nombre aquí si la guardaste como "buoh-cesba-953x1024.png")
import logo from '../assets/buho.png'; 

export default function Sidebar() {
const navigate = useNavigate();
const location = useLocation();

const menuItems = [
{ name: "Dashboard", path: "/dashboard", icon: "📊" },
{ name: "Inventario", path: "/inventario", icon: "📦" },
{ name: "Usuarios", path: "/usuarios", icon: "👥" },
{ name: "Generar QR", path: "/qr", icon: "🔳" },
];

const handleLogout = () => signOut(auth).then(() => navigate("/"));

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
            backgroundColor: location.pathname === item.path ? "#f0f0f0" : "transparent",
            borderRight: location.pathname === item.path ? "4px solid #ff6600" : "none"
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
backgroundColor: "#ffffff",
borderRight: "1px solid #e0e0e0",
display: "flex",
flexDirection: "column",
position: "fixed",
left: 0,
top: 0,
},
logoSection: {
padding: "30px 20px",
borderBottom: "1px solid #f0f0f0",
textAlign: "center",
display: "flex",
flexDirection: "column",
alignItems: "center",
gap: "10px" // Crea un pequeño espacio entre el logo y el texto
},
logoImage: {
width: "120px", // Puedes hacer este número más grande o pequeño según prefieras
height: "auto",
objectFit: "contain"
},
logoText: { 
margin: 0, 
fontSize: "22px", 
fontWeight: "800", 
color: "#333" 
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
linkText: { fontSize: "16px", fontWeight: "500", color: "#444" },
icon: { fontSize: "20px" },
logoutBtn: {
margin: "20px",
padding: "12px",
backgroundColor: "#fff",
border: "1px solid #ff6600",
color: "#ff6600",
borderRadius: "8px",
cursor: "pointer",
fontWeight: "600"
}
};