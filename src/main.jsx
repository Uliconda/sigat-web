// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// 1. Importamos nuestros Providers
import { AuthProvider } from './context/AuthContext.jsx'; 
import { ThemeProvider } from './context/ThemeContext.jsx'; // <--- NUEVO: Importamos el tema

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 2. Envolvemos la App con ambos Providers */}
    <ThemeProvider>   {/* <--- NUEVO: Envuelve todo para dar color */}
      <AuthProvider> 
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);