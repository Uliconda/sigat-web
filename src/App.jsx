// src/App.jsx
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";

// Importamos nuestras pantallas y componentes principales
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory"; 
import Users from "./pages/Users";
import QrGenerator from "./pages/QrGenerator"; 
import { ProtectedRoute } from "./components/ProtectedRoute";
import Maintenance from "./pages/Maintenance";



function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* --- RUTA PÚBLICA --- */}
        <Route path="/" element={<Login />} />

        {/* --- RUTAS PRIVADAS (PROTEGIDAS) --- */}
        
        {/* 1. Panel Principal */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />

        {/* 2. Inventario Profesional */}
        <Route 
          path="/inventario" 
          element={
            <ProtectedRoute>
              <Inventory />
            </ProtectedRoute>
          } 
        />

        {/* 3. Gestión de Usuarios */}
        <Route 
          path="/usuarios" 
          element={
            <ProtectedRoute>
              <Users />
            </ProtectedRoute>
          } 
        />

        {/* 4. Generador de QR */}
        <Route 
          path="/qr" 
          element={
            <ProtectedRoute>
              <QrGenerator />
            </ProtectedRoute>
          } 
        />

        {/* 5. Mantenimiento Preventivo (RCM) */}
        <Route 
          path="/mantenimiento" 
          element={
            <ProtectedRoute>
              <Maintenance />
            </ProtectedRoute>
          } 
        />

        {/* Cualquier otra URL vuelve al inicio. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;