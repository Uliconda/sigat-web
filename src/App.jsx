// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Importamos nuestras pantallas y componentes
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory"; // Importación 
import Users from "./pages/Users";
import QrGenerator from "./pages/QrGenerator"; // Importación del nuevo componente
import { ProtectedRoute } from "./components/ProtectedRoute";

// Pantallas temporales (placeholders) para que el Sidebar no de error al hacer clic
const UsersPlaceholder = () => (
  <div style={{ display: 'flex' }}>
    <div style={{ width: '250px' }}><aside /></div> {/* Espacio para el Sidebar */}
    <div style={{ padding: '40px' }}><h2>Próximamente: Gestión de Usuarios</h2></div>
  </div>
);

const QrPlaceholder = () => (
  <div style={{ display: 'flex' }}>
    <div style={{ width: '250px' }}><aside /></div>
    <div style={{ padding: '40px' }}><h2>Próximamente: Generador de QR</h2></div>
  </div>
);

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

        {/* 3. Gestión de Usuarios (Ruta futura) */}
        <Route 
          path="/usuarios" 
          element={
            <ProtectedRoute>
              <Users />
            </ProtectedRoute>
          } 
        />

        {/* 4. Generador de QR (Ruta futura) */}
        <Route 
          path="/qr" 
          element={
            <ProtectedRoute>
              <QrGenerator />
            </ProtectedRoute>
          } 
        />
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;