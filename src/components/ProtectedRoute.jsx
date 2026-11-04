// src/components/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { PantallaEstado } from "./PantallaEstado";

export function ProtectedRoute({ children }) {
  const { user, userData, loading, authError, refreshProfile } = useAuth();

  // Espera a que Supabase termine de verificar la sesión.
  if (loading) {
    return <PantallaEstado tipo="cargando" titulo="Cargando sistema…" />;
  }

  // Sin sesión: de vuelta al inicio de sesión.
  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (authError && authError.message !== "La cuenta no tiene un perfil SIGAT.") {
    return (
      <PantallaEstado
        tipo="error"
        titulo="No se pudo cargar tu perfil"
        mensaje="Revisa tu conexión a internet e inténtalo de nuevo."
        onReintentar={() => refreshProfile().catch(() => {})}
        mostrarCerrarSesion
      />
    );
  }

  if (!userData) {
    return (
      <PantallaEstado
        tipo="denegado"
        titulo="Cuenta sin perfil SIGAT"
        mensaje="Tu cuenta existe, pero no tiene un perfil en SIGAT. Contacta al administrador."
        mostrarCerrarSesion
      />
    );
  }

  if (userData.must_change_password) {
    return <Navigate to="/?change-password=required" replace />;
  }

  // El panel web es solo para administradores.
  if (userData.rol !== "admin" && userData.rol !== "superadmin") {
    return (
      <PantallaEstado
        tipo="denegado"
        titulo="Acceso solo para administradores"
        mensaje="Tu cuenta no tiene permisos para el panel web. Usa la app móvil SIGAT para registrar préstamos y devoluciones."
        mostrarCerrarSesion
      />
    );
  }

  return children;
}
