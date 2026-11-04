// src/App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PantallaEstado } from "./components/PantallaEstado";

// Cada pantalla se descarga solo cuando se abre: el login no carga gráficas ni reportes.
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Users = lazy(() => import("./pages/Users"));
const QrGenerator = lazy(() => import("./pages/QrGenerator"));
const Maintenance = lazy(() => import("./pages/Maintenance"));

const privada = (pagina) => <ProtectedRoute>{pagina}</ProtectedRoute>;

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PantallaEstado tipo="cargando" />}>
        <Routes>
          {/* --- RUTA PÚBLICA --- */}
          <Route path="/" element={<Login />} />

          {/* --- RUTAS PRIVADAS (solo administradores) --- */}
          <Route path="/dashboard" element={privada(<Dashboard />)} />
          <Route path="/inventario" element={privada(<Inventory />)} />
          <Route path="/usuarios" element={privada(<Users />)} />
          <Route path="/qr" element={privada(<QrGenerator />)} />
          <Route path="/mantenimiento" element={privada(<Maintenance />)} />

          {/* Cualquier otra URL vuelve al inicio. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
