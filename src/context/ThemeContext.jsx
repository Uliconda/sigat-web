import { useEffect, useState } from "react";
import { ThemeContext } from "./theme";

const STORAGE_KEY = "appTheme";

// Tema guardado en una visita anterior, o claro por defecto.
const temaInicial = () => localStorage.getItem(STORAGE_KEY) || "light";

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(temaInicial);

  // Cada vez que el tema cambia, se aplica la clase en el HTML principal.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme !== "dark");
  }, [theme]);

  // Alterna entre claro y oscuro y recuerda la elección.
  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, newTheme);
      return newTheme;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};
