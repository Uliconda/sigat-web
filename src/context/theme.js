import { createContext } from "react";

// Contexto del tema claro/oscuro. Vive en su propio archivo para que
// ThemeContext.jsx solo exporte componentes (requisito de Fast Refresh).
export const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });
