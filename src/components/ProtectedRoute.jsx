// src/components/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }) {
const { user, userData, loading } = useAuth();

  // 1. Si Firebase aún está revisando la sesión, mostramos un mensaje de carga
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

  // 3. Si SÍ está logueado, pero su rol NO es "admin", también le negamos el acceso
if (userData.rol !== "admin" && userData.rol !== "superadmin") {
  return <div>Acceso Denegado. Tu cuenta no tiene permisos de administrador para ver este panel.</div>;
}

  // 4. Si pasó todas las pruebas (está logueado y es admin), le mostramos la pantalla que pidió
return children;
}