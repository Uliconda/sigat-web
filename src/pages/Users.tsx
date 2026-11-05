// src/pages/Users.tsx
import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "../config/supabase";
import {
  solicitarRecuperacion,
  subscribeToProfiles,
  updateProfile,
} from "../services/supabaseData";
import Sidebar from "../components/Sidebar";
import Swal from "sweetalert2";
import { useAuth } from "../context/useAuth";
import { escapeHtml } from "../utils/html";
import { errorDeFuncion, mensajeDeError } from "../utils/errores";
import type { Perfil, Rol } from "../types";
import { MIN_CONTRASENA } from "../constants/contrasena";
import "./Users.css";

interface NuevoUsuario {
  nombre: string;
  email: string;
  password: string;
  rol: Rol;
}

interface CambiosUsuario {
  nombre: string;
  rol: Rol;
  resetPassword: boolean;
}

const USUARIO_VACIO: NuevoUsuario = { nombre: "", email: "", password: "", rol: "usuario" };

export default function Users() {
// EXTRAEMOS user (para el ID) Y userData (para el rol)
const { user, userData } = useAuth();
// La página es privada: siempre hay sesión. El id se usa para no editarse/borrarse a sí mismo.
const miId = user?.id;
const [users, setUsers] = useState<Perfil[]>([]);
const [loading, setLoading] = useState(false);

const [formData, setFormData] = useState<NuevoUsuario>(USUARIO_VACIO);

useEffect(() => {
const unsubscribe = subscribeToProfiles(setUsers, (error) => {
    console.error("Error al cargar usuarios desde Supabase:", error);
});
return () => unsubscribe();
}, []);

const handleCreateUser = async (e: FormEvent<HTMLFormElement>) => {
e.preventDefault();
setLoading(true);
try {
    const { error } = await supabase.functions.invoke("manage-users", {
      body: {
        action: "create",
        email: formData.email,
        password: formData.password,
        nombre: formData.nombre,
        rol: formData.rol,
      },
    });
    if (error) throw await errorDeFuncion(error);

    Swal.fire({
    icon: 'success',
    title: '¡Éxito!',
    text: 'Usuario creado correctamente.',
    timer: 2000,
    showConfirmButton: false
    });
    
    setFormData(USUARIO_VACIO);
} catch (error) {
    console.error(error);
    Swal.fire('No se pudo crear la cuenta', mensajeDeError(error), 'error');
}
setLoading(false);
};

// ==========================================
// EDITAR USUARIO (SWEETALERT) CON CAMBIO DE CONTRASEÑA
// ==========================================
const handleEditUser = async (usuario: Perfil) => {
// 1. Bloquear que el superadmin se edite a sí mismo
if (userData?.rol === "superadmin" && usuario.id === miId) {
    Swal.fire('Acción Bloqueada', 'Como Super Administrador no puedes editar tu propio perfil.', 'error');
    return;
}

// 2. Bloquear que un admin intente editar a un superadmin
if (userData?.rol !== "superadmin" && usuario.rol === "superadmin") {
    Swal.fire('Acceso Denegado', 'No tienes permisos para modificar a un Super Administrador.', 'error');
    return;
}

// Identificamos si el usuario se está editando a sí mismo (para el caso del admin)
const isSelfEdit = usuario.id === miId;
// Un admin no puede cambiar su propio rol
const canChangeRole = userData?.rol === "superadmin" || !isSelfEdit;

const { value: formValues } = await Swal.fire<CambiosUsuario>({
    title: 'Editar Usuario',
    html:
    `<div style="text-align: left;">
        <label style="font-size: 14px; font-weight: bold;">Nombre:</label>
        <input id="swal-input-nombre" class="swal2-input" value="${escapeHtml(usuario.nombre)}" style="margin-top: 5px; margin-bottom: 15px; width: 80%;">
        
        <label style="font-size: 14px; font-weight: bold;">Rol:</label>
        <select id="swal-input-rol" class="swal2-select" style="width: 80%; padding: 10px; margin-bottom: 20px;" ${!canChangeRole ? 'disabled' : ''}>
            <option value="usuario" ${usuario.rol === 'usuario' ? 'selected' : ''}>Usuario Normal</option>
            <option value="admin" ${usuario.rol === 'admin' ? 'selected' : ''}>Administrador</option>
            ${userData?.rol === 'superadmin' ? `<option value="superadmin" ${usuario.rol === 'superadmin' ? 'selected' : ''}>Super Administrador</option>` : ''}
        </select>
        ${!canChangeRole ? `<small style="display: block; color: #d32f2f; margin-bottom: 15px;">* No puedes cambiar tu propio rol.</small>` : ''}

        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #ddd; margin-top: 10px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 14px;">
                <input type="checkbox" id="swal-input-reset" style="width: 18px; height: 18px; cursor: pointer;">
                <b>Enviar correo para restablecer contraseña</b>
            </label>
            <small style="display: block; color: #666; margin-top: 5px; margin-left: 28px;">
                Se enviará un enlace a <b>${escapeHtml(usuario.email)}</b> para que asigne una nueva clave.
            </small>
        </div>
    </div>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Guardar Cambios',
    cancelButtonText: 'Cancelar',
    preConfirm: (): CambiosUsuario => {
    const popup = Swal.getPopup();
    return {
        nombre: popup?.querySelector<HTMLInputElement>('#swal-input-nombre')?.value ?? "",
        rol: (popup?.querySelector<HTMLSelectElement>('#swal-input-rol')?.value ?? usuario.rol) as Rol,
        resetPassword: popup?.querySelector<HTMLInputElement>('#swal-input-reset')?.checked ?? false,
    };
    }
});

if (formValues) {
    // 3. Validación extra por si se manipula el HTML
    if (userData?.rol !== "superadmin" && formValues.rol === "superadmin") {
    Swal.fire('Acceso Denegado', 'No tienes permisos para otorgar el rol de Super Administrador.', 'error');
    return;
    }

    // 4. Validación extra: Evitar que el admin se quite su propio rol por código
    if (!canChangeRole && formValues.rol !== usuario.rol) {
    Swal.fire('Acción Bloqueada', 'No puedes cambiar tu propio rol.', 'error');
    return;
    }

    try {
    await updateProfile(usuario.id, {
        nombre: formValues.nombre,
        rol: formValues.rol
    });

    // ENVIAR CORREO SI EL CHECKBOX ESTÁ MARCADO
    if (formValues.resetPassword) {
        await solicitarRecuperacion(usuario.email);
        Swal.fire({ 
            icon: 'success', 
            title: '¡Actualizado!', 
            text: `Datos guardados y correo de recuperación enviado a ${usuario.email}`, 
            timer: 3500, 
            showConfirmButton: false 
        });
    } else {
        Swal.fire({ icon: 'success', title: '¡Actualizado!', timer: 2000, showConfirmButton: false });
    }

    } catch (error) {
    console.error("Error al editar:", error);
    Swal.fire('No se pudieron guardar los cambios', mensajeDeError(error), 'error');
    }
}
};

// ==========================================
// ELIMINAR USUARIO
// ==========================================
const handleDeleteUser = async (targetUser: Perfil) => {
// 1. Evitar que el usuario se borre a sí mismo
if (targetUser.id === miId) {
    Swal.fire('Acción Bloqueada', 'Por seguridad, no puedes eliminar tu propia cuenta.', 'error');
    return;
}

// 2. Validaciones de seguridad de roles
const isSuperAdmin = userData?.rol === "superadmin";
const isAdminDeletingNormalUser = userData?.rol === "admin" && targetUser.rol === "usuario";

if (!isSuperAdmin && !isAdminDeletingNormalUser) {
    Swal.fire(
    'Acceso Denegado', 
    'No tienes permisos para eliminar a este tipo de usuario. Solo puedes eliminar usuarios normales.', 
    'error'
    );
    return;
}

const result = await Swal.fire({
    title: '¿Estás seguro?',
    text: `Vas a eliminar a ${targetUser.nombre}. Perderá el acceso al sistema.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
});

if (result.isConfirmed) {
    try {
    const { error } = await supabase.functions.invoke("manage-users", {
        body: { action: "delete", userId: targetUser.id },
    });
    if (error) throw await errorDeFuncion(error);
    Swal.fire('¡Eliminado!', 'El usuario ha sido removido.', 'success');
    } catch (error) {
    console.error("Error al eliminar usuario:", error);
    Swal.fire('No se pudo eliminar al usuario', mensajeDeError(error), 'error');
    }
}
};

return (
<div className="app-layout">
    <Sidebar />

    <main className="app-main usuarios-main">

    <section className="usuarios-lista">
        <header className="pagina-encabezado usuarios-encabezado">
        <div>
            <h1 className="pagina-titulo">Gestión de Usuarios</h1>
            <p className="pagina-subtitulo">Lista de personas con acceso al sistema</p>
        </div>
        </header>

        <div className="tabla-tarjeta usuarios-tabla-tarjeta">
        <table className="tabla usuarios-tabla">
            <thead>
            <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th className="centrado">Acciones</th>
            </tr>
            </thead>
            <tbody>
            {/* EL FILTRO FANTASMA: Solo ves a los Super Admins si tú eres Super Admin */}
            {users
                .filter((u) => userData?.rol === "superadmin" || u.rol !== "superadmin")
                .map((u) => (
                <tr key={u.id}>
                <td className="negrita">{u.nombre}</td>
                <td>{u.email}</td>
                <td>
                    <span className={`usuarios-rol usuarios-rol--${u.rol}`}>{u.rol}</span>
                </td>

                <td className="centrado">
                    <div className="usuarios-acciones">
                    {/* Botón de Editar: Se oculta para el propio Super Admin */}
                    {(userData?.rol === "admin" || userData?.rol === "superadmin") && !(userData?.rol === "superadmin" && u.id === miId) && (
                        <button type="button" onClick={() => handleEditUser(u)} className="usuarios-boton usuarios-boton--editar">
                        Editar
                        </button>
                    )}

                    {/* Botón de Eliminar condicionado por rol Y bloqueando la cuenta propia */}
                    {u.id !== miId && (userData?.rol === "superadmin" || (userData?.rol === "admin" && u.rol === "usuario")) && (
                        <button type="button" onClick={() => handleDeleteUser(u)} className="usuarios-boton usuarios-boton--borrar">
                        Borrar
                        </button>
                    )}
                    </div>
                </td>
                </tr>
            ))}
            </tbody>
        </table>
        </div>
    </section>

    <section className="usuarios-registro">
        <div className="tarjeta usuarios-formulario-tarjeta">
        <h3>Registrar Nuevo</h3>
        <form onSubmit={handleCreateUser} className="usuarios-formulario">
            <div className="usuarios-campo">
            <label htmlFor="nuevo-nombre">Nombre Completo</label>
            <input
                id="nuevo-nombre"
                type="text" required className="usuarios-input"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            />
            </div>
            <div className="usuarios-campo">
            <label htmlFor="nuevo-email">Correo Electrónico</label>
            <input
                id="nuevo-email"
                type="email" required className="usuarios-input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            </div>
            <div className="usuarios-campo">
            <label htmlFor="nuevo-password">Contraseña Provisional</label>
            <input
                id="nuevo-password"
                type="password" required minLength={MIN_CONTRASENA} className="usuarios-input"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            </div>
            <div className="usuarios-campo">
            <label htmlFor="nuevo-rol">Rol del Usuario</label>
            <select
                id="nuevo-rol"
                className="usuarios-input"
                value={formData.rol}
                onChange={(e) => setFormData({ ...formData, rol: e.target.value as Rol })}
            >
                <option value="usuario">Usuario Normal</option>
                {userData?.rol === "superadmin" && (
                <option value="admin">Administrador</option>
                )}
                {userData?.rol === "superadmin" && (
                <option value="superadmin">Super Administrador</option>
                )}
            </select>
            </div>
            <button type="submit" disabled={loading} className="usuarios-crear">
            {loading ? "Registrando..." : "Crear Cuenta"}
            </button>
        </form>
        </div>
    </section>

    </main>
</div>
);
}
