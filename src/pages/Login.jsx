// src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../config/supabase";
import { getProfile } from "../services/supabaseData";
import { useAuth } from "../context/useAuth";

export default function Login() {
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);
const [recovery, setRecovery] = useState(false);
const [mustChangePassword, setMustChangePassword] = useState(false);
const [resetMode, setResetMode] = useState(false);
const [resetSent, setResetSent] = useState(false);
const [newPassword, setNewPassword] = useState("");
const [confirmNewPassword, setConfirmNewPassword] = useState("");

const navigate = useNavigate(); // Herramienta para cambiar de página
const { refreshProfile } = useAuth();

useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
        if (!active || sessionError || !data.session?.user) return;
        try {
            const profile = await getProfile(data.session.user.id);
            if (active && profile?.must_change_password) setMustChangePassword(true);
        } catch (profileError) {
            console.error("Error al cargar el perfil para cambiar contraseña:", profileError);
            if (active) setError("No se pudo verificar el perfil de esta cuenta.");
        }
    }).catch((sessionError) => {
        if (active) {
            console.error("Error al verificar la sesión:", sessionError);
            setError("No se pudo verificar la sesión de Supabase.");
        }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
        active = false;
        subscription.unsubscribe();
    };
}, []);

const handleLogin = async (e) => {
e.preventDefault(); // Evita que la página se recargue al enviar el formulario
setError("");
setLoading(true);

try {
    const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    if (loginError) throw loginError;

    const profile = await getProfile(data.user.id);
    if (profile?.must_change_password) {
        setMustChangePassword(true);
        return;
    }
    if (profile?.rol === "admin" || profile?.rol === "superadmin") {
        navigate("/dashboard");
    } else {
        await supabase.auth.signOut();
        setError(profile
            ? "Acceso denegado: Esta plataforma es solo para administradores."
            : "La cuenta no tiene un perfil SIGAT. Contacta al administrador.");
    }
} catch (err) {
    console.error("Error en login:", err);
    setError("No se pudo iniciar sesión. Verifica tus datos y que Supabase esté configurado.");
} finally {
    setLoading(false);
}
};

const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setResetSent(true);
    } catch (err) {
        console.error("Error al solicitar restablecimiento:", err);
        setError("No se pudo enviar el correo de restablecimiento.");
    } finally {
        setLoading(false);
    }
};

const handleNewPassword = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
        if (newPassword !== confirmNewPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        if (mustChangePassword) {
            const { error: changeError } = await supabase.functions.invoke("manage-users", {
                body: { action: "set-initial-password", newPassword },
            });
            if (changeError) throw changeError;
            setMustChangePassword(false);
            await refreshProfile();
        } else {
            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
            if (updateError) throw updateError;
        }
        setRecovery(false);
        setNewPassword("");
        setConfirmNewPassword("");
        navigate("/dashboard");
    } catch (err) {
        console.error("Error al actualizar la contraseña:", err);
        setError("No se pudo actualizar la contraseña. Solicita un nuevo enlace.");
    } finally {
        setLoading(false);
    }
};

return (
<div style={styles.container}>
    <div style={styles.card}>
    <h2 style={styles.title}>SIGAT Admin</h2>
    <p style={styles.subtitle}>
        {mustChangePassword || recovery
            ? "Establecer nueva contraseña"
            : resetMode
              ? "Restablecer contraseña"
              : "Panel de Control"}
    </p>

    {mustChangePassword && (
        <div role="status" style={styles.successBox}>
            Esta contraseña temporal debe cambiarse antes de continuar. Usa una contraseña nueva de al menos 12 caracteres.
        </div>
    )}

    {error && <div style={styles.errorBox}>{error}</div>}

    {resetSent && (
        <div role="status" style={styles.successBox}>
            Si el correo está registrado, Supabase aceptó la solicitud. Revisa la bandeja de entrada y spam.
            En el modo de prueba de Resend, el destinatario debe ser el correo verificado en Resend.
        </div>
    )}

    {recovery || mustChangePassword ? (
    <form onSubmit={handleNewPassword} style={styles.form}>
        <div style={styles.inputGroup}>
        <label>Nueva contraseña</label>
        <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={12}
            required
            style={styles.input}
            autoComplete="new-password"
        />
        </div>
        <div style={styles.inputGroup}>
        <label>Confirmar nueva contraseña</label>
        <input
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            minLength={12}
            required
            style={styles.input}
            autoComplete="new-password"
        />
        </div>
        <button type="submit" disabled={loading} style={styles.button}>
        {loading ? "Guardando..." : "Guardar contraseña"}
        </button>
    </form>
    ) : resetMode ? (
    <form onSubmit={handleResetPassword} style={styles.form}>
        <div style={styles.inputGroup}>
        <label>Correo Electrónico</label>
        <input
            type="email"
            value={email}
            onChange={(e) => {
                setEmail(e.target.value);
                setResetSent(false);
                setError("");
            }}
            required
            style={styles.input}
            autoComplete="email"
        />
        </div>
        <button type="submit" disabled={loading} style={styles.button}>
        {loading ? "Solicitando..." : resetSent ? "Reenviar enlace" : "Enviar enlace"}
        </button>
        <button
            type="button"
            onClick={() => {
                setResetMode(false);
                setResetSent(false);
                setError("");
            }}
            style={styles.resetButton}
        >
            Volver al inicio de sesión
        </button>
    </form>
    ) : (
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
    )}
    {!recovery && !mustChangePassword && !resetMode && (
        <button
            type="button"
            onClick={() => {
                setResetMode(true);
                setResetSent(false);
                setError("");
            }}
            disabled={loading || !email}
            style={styles.resetButton}
        >
            Restablecer contraseña
        </button>
    )}
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
resetButton: {
background: "none",
border: "none",
color: "#ff6600",
cursor: "pointer",
marginTop: "12px",
},
errorBox: {
backgroundColor: "#ffe6e6",
color: "#d9534f",
padding: "10px",
borderRadius: "5px",
marginBottom: "15px",
textAlign: "center",
fontSize: "14px",
},
successBox: {
backgroundColor: "#e8f5e9",
color: "#256029",
padding: "10px",
borderRadius: "5px",
marginBottom: "15px",
textAlign: "center",
fontSize: "14px",
}
};