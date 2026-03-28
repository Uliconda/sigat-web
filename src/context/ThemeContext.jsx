import { createContext, useState, useEffect } from "react";

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
const [theme, setTheme] = useState("light");

// 1. Al cargar la app, revisamos si el usuario ya había elegido un tema antes
useEffect(() => {
const storedTheme = localStorage.getItem("appTheme");
if (storedTheme) {
    setTheme(storedTheme);
}
}, []);

// 2. Cada vez que el tema cambia, inyectamos la clase en el HTML principal
useEffect(() => {
if (theme === "dark") {
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
} else {
    document.documentElement.classList.add("light");
    document.documentElement.classList.remove("dark");
}
}, [theme]);

// 3. Función para alternar entre claro y oscuro
const toggleTheme = () => {
setTheme((prevTheme) => {
    const newTheme = prevTheme === "light" ? "dark" : "light";
    localStorage.setItem("appTheme", newTheme);
    return newTheme;
});
};

return (
<ThemeContext.Provider value={{ theme, toggleTheme }}>
    {children}
</ThemeContext.Provider>
);
};