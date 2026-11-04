import { createContext } from "react";

export type Tema = "light" | "dark";

export interface ThemeContextValue {
  theme: Tema;
  toggleTheme: () => void;
}

// Contexto del tema claro/oscuro. Vive en su propio archivo para que
// ThemeProvider.tsx solo exporte componentes (requisito de Fast Refresh).
export const ThemeContext = createContext<ThemeContextValue>({ theme: "light", toggleTheme: () => {} });
