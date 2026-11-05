// src/pages/Login.tsx
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { enlaceRecuperacion, supabase, terminarRecuperacion } from "../config/supabase";
import { getProfile, solicitarRecuperacion } from "../services/supabaseData";
import { useAuth } from "../context/useAuth";
import logo from "../assets/logo-buho.webp";
import { errorDeFuncion, mensajeDeError } from "../utils/errores";
import "./Login.css";

export default function Login() {
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState(enlaceRecuperacion.error ?? "");
const [aviso, setAviso] = useState("");
const [loading, setLoading] = useState(false);
// Si se llegó desde el enlace del correo, se muestra directo el formulario de nueva contraseña.
const [recovery, setRecovery] = useState(enlaceRecuperacion.pendiente);
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

const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
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

const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
        await solicitarRecuperacion(email);
        setResetSent(true);
    } catch (err) {
        console.error("Error al solicitar restablecimiento:", err);
        setError(mensajeDeError(err, "No se pudo enviar el correo de restablecimiento."));
    } finally {
        setLoading(false);
    }
};

const handleNewPassword = async (e: FormEvent<HTMLFormElement>) => {
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
            const { data: actualizado, error: updateError } = await supabase.auth.updateUser({ password: newPassword });
            if (updateError) throw updateError;
            terminarRecuperacion();
            setRecovery(false);
            setNewPassword("");
            setConfirmNewPassword("");
            // Las cuentas que no son de administrador usan la app móvil: no tienen acceso al panel.
            const perfil = await getProfile(actualizado.user.id);
            if (perfil?.rol !== "admin" && perfil?.rol !== "superadmin") {
                await supabase.auth.signOut();
                setAviso("Tu contraseña se actualizó. Ya puedes iniciar sesión en la app móvil SIGAT.");
                return;
            }
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
<div className="login">
    <div className="login__tarjeta">
    <img src={logo} alt="" width="88" height="92" className="login__logo" />
    <h2 className="login__titulo">SIGAT Admin</h2>
    <p className="login__subtitulo">
        {mustChangePassword || recovery
            ? "Establecer nueva contraseña"
            : resetMode
              ? "Restablecer contraseña"
              : "Panel de Control"}
    </p>

    {mustChangePassword && (
        <div role="status" className="login__aviso login__aviso--exito">
            Esta contraseña temporal debe cambiarse antes de continuar. Usa una contraseña nueva de al menos 12 caracteres.
        </div>
    )}

    {error && <div role="alert" className="login__aviso login__aviso--error">{error}</div>}
    {aviso && <div role="status" className="login__aviso login__aviso--exito">{aviso}</div>}

    {resetSent && (
        <div role="status" className="login__aviso login__aviso--exito">
            Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.
            Revisa tu bandeja de entrada y la carpeta de spam. El enlace vence en 1 hora.
        </div>
    )}

    {recovery || mustChangePassword ? (
    <form onSubmit={handleNewPassword} className="login__formulario">
        <div className="login__campo">
        <label htmlFor="login-campo-1">Nueva contraseña</label>
        <input
            id="login-campo-1"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={12}
            required
            className="login__input"
            autoComplete="new-password"
        />
        </div>
        <div className="login__campo">
        <label htmlFor="login-campo-2">Confirmar nueva contraseña</label>
        <input
            id="login-campo-2"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            minLength={12}
            required
            className="login__input"
            autoComplete="new-password"
        />
        </div>
        <button type="submit" disabled={loading} className="login__boton">
        {loading ? "Guardando..." : "Guardar contraseña"}
        </button>
    </form>
    ) : resetMode ? (
    <form onSubmit={handleResetPassword} className="login__formulario">
        <div className="login__campo">
        <label htmlFor="login-campo-3">Correo Electrónico</label>
        <input
            id="login-campo-3"
            type="email"
            value={email}
            onChange={(e) => {
                setEmail(e.target.value);
                setResetSent(false);
                setError("");
            }}
            required
            className="login__input"
            autoComplete="email"
        />
        </div>
        <button type="submit" disabled={loading} className="login__boton">
        {loading ? "Solicitando..." : resetSent ? "Reenviar enlace" : "Enviar enlace"}
        </button>
        <button
            type="button"
            onClick={() => {
                setResetMode(false);
                setResetSent(false);
                setError("");
            }}
            className="login__enlace"
        >
            Volver al inicio de sesión
        </button>
    </form>
    ) : (
    <form onSubmit={handleLogin} className="login__formulario">
        <div className="login__campo">
        <label htmlFor="login-campo-4">Correo Electrónico</label>
        <input
            id="login-campo-4"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="login__input"
            placeholder="admin@sigat.com"
        />
        </div>

        <div className="login__campo">
        <label htmlFor="login-campo-5">Contraseña</label>
        <input
            id="login-campo-5"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="login__input"
            placeholder="********"
        />
        </div>

        <button type="submit" disabled={loading} className="login__boton">
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
                setAviso("");
            }}
            disabled={loading}
            className="login__enlace"
        >
            ¿Olvidaste tu contraseña?
        </button>
    )}
    </div>
</div>
);
}
