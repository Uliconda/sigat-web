// src/components/Sidebar.tsx
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../config/supabase";
import { subscribeToEquipos } from "../services/supabaseData";
import logo from "../assets/logo-buho.webp";
import type { Equipo } from "../types";
import { esUrgente } from "../utils/mantenimiento";
import "./Sidebar.css";

const MENU = [
  { name: "Dashboard", path: "/dashboard", icon: "📊" },
  { name: "Inventario", path: "/inventario", icon: "📦" },
  { name: "Usuarios", path: "/usuarios", icon: "👥" },
  { name: "Mantenimiento", path: "/mantenimiento", icon: "🛠️" },
  { name: "Personal Administrativo", path: "/personal", icon: "🗂️" },
];

// Misma regla que la pantalla de Mantenimiento (ver utils/mantenimiento.ts).
const contarUrgentes = (equipos: Equipo[]): number => {
  const ahora = Date.now();
  return equipos.filter((equipo) => esUrgente(equipo, ahora)).length;
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [urgentCount, setUrgentCount] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(location.pathname);

  // Al cambiar de página el menú del celular se cierra solo.
  if (abierto && rutaAbierta !== location.pathname) {
    setAbierto(false);
  }

  useEffect(
    () =>
      subscribeToEquipos(
        (equipos) => setUrgentCount(contarUrgentes(equipos)),
        (error) => console.error("Error al cargar equipos para mantenimiento:", error)
      ),
    []
  );

  // Escape cierra el menú y se bloquea el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [abierto]);

  const abrirMenu = () => {
    setRutaAbierta(location.pathname);
    setAbierto(true);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error al cerrar sesión:", error);
      return;
    }
    navigate("/");
  };

  const paginaActual = MENU.find((item) => item.path === location.pathname)?.name ?? "SIGAT";

  return (
    <>
      {/* Barra superior: solo en celular y tablet */}
      <header className="topbar">
        <button
          type="button"
          className="topbar__menu"
          onClick={abrirMenu}
          aria-label="Abrir menú"
          aria-expanded={abierto}
          aria-controls="sidebar"
        >
          <span aria-hidden="true">☰</span>
          {urgentCount > 0 && <span className="topbar__punto" aria-hidden="true" />}
        </button>
        <span className="topbar__titulo">{paginaActual}</span>
        <img src={logo} alt="" className="topbar__logo" width="32" height="32" />
      </header>

      <div
        className={`sidebar-fondo${abierto ? " sidebar-fondo--visible" : ""}`}
        onClick={() => setAbierto(false)}
        aria-hidden="true"
      />

      <aside id="sidebar" className={`sidebar${abierto ? " sidebar--abierto" : ""}`} aria-label="Menú principal">
        <div className="sidebar__logo">
          <img src={logo} alt="Logo de la escuela" width="120" height="125" />
          <h2>
            SIGAT <span>WEB</span>
          </h2>
          <button type="button" className="sidebar__cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar menú">
            ✕
          </button>
        </div>

        <nav className="sidebar__nav">
          {MENU.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar__item${isActive ? " sidebar__item--activo" : ""}`}
            >
              <span className="sidebar__item-icono" aria-hidden="true">{item.icon}</span>
              <span className="sidebar__item-texto">{item.name}</span>
              {item.path === "/mantenimiento" && urgentCount > 0 && (
                <span className="sidebar__badge" aria-label={`${urgentCount} urgentes`}>{urgentCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <button type="button" className="sidebar__salir" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </aside>

      {/* Aviso flotante de mantenimiento urgente en cualquier pantalla */}
      {urgentCount > 0 && location.pathname !== "/mantenimiento" && (
        <button type="button" className="aviso-urgente" onClick={() => navigate("/mantenimiento?filtro=urgente")}>
          ⚠️ {urgentCount} {urgentCount === 1 ? "equipo" : "equipos"} con mantenimiento <b>URGENTE</b>
        </button>
      )}
    </>
  );
}
