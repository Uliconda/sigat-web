// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/componentes.css";
import { AuthProvider } from "./context/AuthProvider";
import { ThemeProvider } from "./context/ThemeProvider";

const raiz = document.getElementById("root");
if (!raiz) throw new Error('Falta el elemento <div id="root"> en index.html.');

createRoot(raiz).render(
  <StrictMode>
    {/* El tema envuelve todo; la sesión, a las pantallas. */}
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
