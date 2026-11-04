// src/components/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export function ProtectedRoute({ children }) {
const { user, userData, loading, authError } = useAuth();

  // Espera a que Supabase termine de verificar la sesión.
if (loading) {
    return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '50px' }}>
        <h2>Cargando sistema...</h2>
    </div>
    );
}

  // 2. Si NO hay usuario logueado, lo pateamos directo a la pantalla de Login ("/")
if (!user) {
    return <Navigate to="/" replace />;
}

if (authError) {
  return <div role="alert">No se pudo cargar tu perfil. Revisa la conexión con Supabase e inténtalo de nuevo.</div>;
}

if (!userData) {
  return <div role="alert">La cuenta no tiene un perfil SIGAT. Contacta al administrador.</div>;
}

if (userData.must_change_password) {
  return <Navigate to="/?change-password=required" replace />;
}

  // 3. Si SÍ está logueado, pero su rol NO es "admin", también le negamos el acceso
if (userData.rol !== "admin" && userData.rol !== "superadmin") {
  return <div>Acceso Denegado. Tu cuenta no tiene permisos de administrador para ver este panel.</div>;
}

  // 4. Si pasó todas las pruebas (está logueado y es admin), le mostramos la pantalla que pidió
return children;
}