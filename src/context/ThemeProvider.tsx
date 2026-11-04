import { useEffect, useState, type ReactNode } from "react";
import { ThemeContext, type Tema } from "./theme";

const STORAGE_KEY = "appTheme";
const consultaOscuro = (): MediaQueryList | undefined => window.matchMedia?.("(prefers-color-scheme: dark)");

function leerGuardado(): Tema | null {
  try {
    const valor = localStorage.getItem(STORAGE_KEY);
    return valor === "dark" || valor === "light" ? valor : null;
  } catch {
    return null;
  }
}

// Tema elegido antes por el usuario o, si nunca eligió, el del sistema operativo.
const temaInicial = (): Tema => leerGuardado() ?? (consultaOscuro()?.matches ? "dark" : "light");

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Tema>(temaInicial);

  // Cada vez que el tema cambia, se aplica la clase en el HTML principal.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme !== "dark");
  }, [theme]);

  // Mientras el usuario no elija uno, sigue los cambios del sistema (p. ej. modo noche automático).
  useEffect(() => {
    const media = consultaOscuro();
    if (!media) return undefined;
    const onChange = (event: MediaQueryListEvent) => {
      if (!leerGuardado()) setTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Alterna entre claro y oscuro y recuerda la elección.
  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme: Tema = prevTheme === "light" ? "dark" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
      } catch {
        // Sin almacenamiento (modo privado): el cambio dura solo esta visita.
      }
      return newTheme;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};
