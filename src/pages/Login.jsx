// src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../config/supabase";
import { getProfile } from "../services/supabaseData";
import { useAuth } from "../context/useAuth";
import logo from "../assets/logo-buho.webp";
import { errorDeFuncion, mensajeDeError } from "../utils/errores";

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
            if (changeError) throw await errorDeFuncion(changeError);
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
        setError(mustChangePassword
            ? mensajeDeError(err, "No se pudo actualizar la contraseña.")
            : "No se pudo actualizar la contraseña. Solicita un nuevo enlace.");
    } finally {
        setLoading(false);
    }
};

return (
<div style={styles.container}>
    <div style={styles.card}>
    <img src={logo} alt="" width="88" height="92" style={{ display: "block", margin: "0 auto 12px", height: "auto" }} />
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
minHeight: "100vh",
padding: "16px",
backgroundColor: "var(--bg-color)",
},
card: {
backgroundColor: "var(--card-bg)",
color: "var(--text-color)",
padding: "clamp(24px, 6vw, 40px)",
borderRadius: "16px",
border: "1px solid var(--border-color)",
boxShadow: "var(--shadow-md)",
width: "100%",
maxWidth: "400px",
},
title: {
textAlign: "center",
marginBottom: "5px",
color: "var(--text-color)",
},
subtitle: {
textAlign: "center",
marginBottom: "20px",
color: "var(--text-muted)",
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
padding: "12px",
borderRadius: "8px",
border: "1px solid var(--border-color)",
backgroundColor: "var(--input-bg)",
color: "var(--text-color)",
fontSize: "16px", // 16px evita el zoom automático de iPhone al enfocar
},
button: {
padding: "12px",
backgroundColor: "var(--primary)",
color: "white",
border: "none",
borderRadius: "8px",
fontSize: "16px",
cursor: "pointer",
fontWeight: "bold",
marginTop: "10px",
},
resetButton: {
background: "none",
border: "none",
color: "var(--primary)",
cursor: "pointer",
marginTop: "12px",
padding: "8px",
},
errorBox: {
backgroundColor: "rgba(198, 40, 40, 0.12)",
color: "var(--danger)",
padding: "10px",
borderRadius: "8px",
marginBottom: "15px",
textAlign: "center",
fontSize: "14px",
},
successBox: {
backgroundColor: "rgba(46, 125, 50, 0.12)",
color: "var(--success)",
padding: "10px",
borderRadius: "8px",
marginBottom: "15px",
textAlign: "center",
fontSize: "14px",
}
};
