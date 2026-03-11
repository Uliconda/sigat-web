// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

export default function Login() {
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);

const navigate = useNavigate(); // Herramienta para cambiar de página

const handleLogin = async (e) => {
e.preventDefault(); // Evita que la página se recargue al enviar el formulario
setError("");
setLoading(true);

try {
    // 1. Intentamos iniciar sesión con Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Buscamos el documento del usuario en Firestore para ver su rol
    const docRef = doc(db, "Usuarios", user.uid);
    const docSnap = await getDoc(docRef);

    // 3. Verificamos que el documento exista y leemos sus datos
    if (docSnap.exists()) {
    const userData = docSnap.data();

    // 4. Dejamos entrar tanto al admin como al superadmin
    if (userData.rol === "admin" || userData.rol === "superadmin") {
        navigate("/dashboard");
    } else {
        // Existe, pero es un usuario normal. Le cerramos la puerta.
        await signOut(auth);
        setError("Acceso denegado: Esta plataforma es solo para administradores.");
    }
    } else {
    // El usuario está en Auth pero no en la colección de Firestore
    await signOut(auth);
    setError("Error: El usuario no tiene un perfil en la base de datos.");
    }
} catch (err) {
    console.error("Error en login:", err);
    setError("Correo o contraseña incorrectos. Intenta de nuevo.");
} finally {
    setLoading(false);
}
};

return (
<div style={styles.container}>
    <div style={styles.card}>
    <h2 style={styles.title}>SIGAT Admin</h2>
    <p style={styles.subtitle}>Panel de Control</p>

    {/* Mostramos el mensaje de error si existe */}
    {error && <div style={styles.errorBox}>{error}</div>}

    <form onSubmit={handleLogin} style={styles.form}>
        <div style={styles.inputGroup}>
        <label>Correo Electrónico</label>
        <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
            placeholder="admin@sigat.com"
        />
        </div>

        <div style={styles.inputGroup}>
        <label>Contraseña</label>
        <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
            placeholder="********"
        />
        </div>

        <button type="submit" disabled={loading} style={styles.button}>
        {loading ? "Verificando..." : "Ingresar"}
        </button>
    </form>
    </div>
</div>
);
}

// Estilos básicos en línea
const styles = {
container: {
display: "flex",
justifyContent: "center",
alignItems: "center",
height: "100vh",
backgroundColor: "#f4f7f6",
},
card: {
backgroundColor: "white",
padding: "40px",
borderRadius: "10px",
boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
width: "100%",
maxWidth: "400px",
},
title: {
textAlign: "center",
marginBottom: "5px",
color: "#333",
},
subtitle: {
textAlign: "center",
marginBottom: "20px",
color: "#666",
},
form: {
display: "flex",
flexDirection: "column",
gap: "15px",
},
inputGroup: {
display: "flex",
flexDirection: "column",
gap: "5px",
},
input: {
padding: "10px",
borderRadius: "5px",
border: "1px solid #ccc",
fontSize: "16px",
},
button: {
padding: "12px",
backgroundColor: "#ff6600", // Color naranja de SIGAT
color: "white",
border: "none",
borderRadius: "5px",
fontSize: "16px",
cursor: "pointer",
fontWeight: "bold",
marginTop: "10px",
},
errorBox: {
backgroundColor: "#ffe6e6",
color: "#d9534f",
padding: "10px",
borderRadius: "5px",
marginBottom: "15px",
textAlign: "center",
fontSize: "14px",
}
};