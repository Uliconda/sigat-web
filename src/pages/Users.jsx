// src/pages/Users.jsx
import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
// IMPORTANTE: Agregamos sendPasswordResetEmail aquí
import { createUserWithEmailAndPassword, getAuth, signOut, sendPasswordResetEmail } from "firebase/auth";
import { initializeApp } from "firebase/app";
import { db, auth } from "../config/firebase"; 
import Sidebar from "../components/Sidebar";
import Swal from "sweetalert2";
import { useAuth } from "../context/AuthContext";

const firebaseConfig = {
apiKey: "AIzaSyCb43aVyAPrDuYLpqBEbNgwPFaqNMilFus",
authDomain: "sigat-627cd.firebaseapp.com",
projectId: "sigat-627cd",
storageBucket: "sigat-627cd.firebasestorage.app",
messagingSenderId: "729844215540",
appId: "1:729844215540:web:060c9179bd15a8ec0bb8a1"
};
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

export default function Users() {
// EXTRAEMOS user (para el ID) Y userData (para el rol)
const { user, userData } = useAuth(); 
const [users, setUsers] = useState([]);
const [loading, setLoading] = useState(false);

const [formData, setFormData] = useState({
nombre: "",
email: "",
password: "",
rol: "usuario"
});

useEffect(() => {
const unsubscribe = onSnapshot(collection(db, "Usuarios"), (snapshot) => {
    setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
});
return () => unsubscribe();
}, []);

const handleCreateUser = async (e) => {
e.preventDefault();
setLoading(true);
try {
    const userCredential = await createUserWithEmailAndPassword(
    secondaryAuth,
    formData.email,
    formData.password
    );
    const newUserId = userCredential.user.uid;

    await setDoc(doc(db, "Usuarios", newUserId), {
    nombre: formData.nombre,
    email: formData.email,
    rol: formData.rol,
    createdAt: new Date().toISOString()
    });

    await signOut(secondaryAuth);

    Swal.fire({
    icon: 'success',
    title: '¡Éxito!',
    text: 'Usuario creado correctamente.',
    timer: 2000,
    showConfirmButton: false
    });
    
    setFormData({ nombre: "", email: "", password: "", rol: "usuario" });
} catch (error) {
    console.error(error);
    Swal.fire('Error', `No se pudo crear: ${error.message}`, 'error');
}
setLoading(false);
};

// ==========================================
// EDITAR USUARIO (SWEETALERT) CON CAMBIO DE CONTRASEÑA
// ==========================================
const handleEditUser = async (usuario) => {
// 1. Bloquear que el superadmin se edite a sí mismo
if (userData?.rol === "superadmin" && usuario.id === user.uid) {
    Swal.fire('Acción Bloqueada', 'Como Super Administrador no puedes editar tu propio perfil.', 'error');
    return;
}

// 2. Bloquear que un admin intente editar a un superadmin
if (userData?.rol !== "superadmin" && usuario.rol === "superadmin") {
    Swal.fire('Acceso Denegado', 'No tienes permisos para modificar a un Super Administrador.', 'error');
    return;
}

// Identificamos si el usuario se está editando a sí mismo (para el caso del admin)
const isSelfEdit = usuario.id === user.uid;
// Un admin no puede cambiar su propio rol
const canChangeRole = userData?.rol === "superadmin" || !isSelfEdit;

const { value: formValues } = await Swal.fire({
    title: 'Editar Usuario',
    html:
    `<div style="text-align: left;">
        <label style="font-size: 14px; font-weight: bold;">Nombre:</label>
        <input id="swal-input-nombre" class="swal2-input" value="${usuario.nombre || ''}" style="margin-top: 5px; margin-bottom: 15px; width: 80%;">
        
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
                Se enviará un enlace a <b>${usuario.email}</b> para que asigne una nueva clave.
            </small>
        </div>
    </div>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Guardar Cambios',
    cancelButtonText: 'Cancelar',
    preConfirm: () => {
    return {
        nombre: document.getElementById('swal-input-nombre').value,
        rol: document.getElementById('swal-input-rol').value,
        resetPassword: document.getElementById('swal-input-reset').checked
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
    const userRef = doc(db, "Usuarios", usuario.id);
    await updateDoc(userRef, {
        nombre: formValues.nombre,
        rol: formValues.rol
    });

    // ENVIAR CORREO SI EL CHECKBOX ESTÁ MARCADO
    if (formValues.resetPassword) {
        await sendPasswordResetEmail(auth, usuario.email);
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
    Swal.fire('Error', 'No se pudieron guardar los cambios.', 'error');
    }
}
};

// ==========================================
// ELIMINAR USUARIO
// ==========================================
const handleDeleteUser = async (targetUser) => {
// 1. Evitar que el usuario se borre a sí mismo
if (targetUser.id === user.uid) {
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
    await deleteDoc(doc(db, "Usuarios", targetUser.id));
    Swal.fire('¡Eliminado!', 'El usuario ha sido removido.', 'success');
    } catch (error) {
    console.error("Error al eliminar usuario:", error);
    Swal.fire('Error', 'No se pudo eliminar al usuario.', 'error');
    }
}
};

return (
// Cambiamos el fondo general
<div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--bg-color)", transition: "0.3s" }}>
    <Sidebar />

    <main style={{ marginLeft: "250px", flex: 1, padding: "40px", display: "flex", gap: "30px" }}>

    <div style={{ flex: 2 }}>
        <h1 style={styles.title}>Gestión de Usuarios</h1>
        <p style={styles.subtitle}>Lista de personas con acceso al sistema</p>

        <div style={styles.tableCard}>
        <table style={styles.table}>
            <thead>
            <tr style={styles.theadRow}>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Rol</th>
                <th style={{ ...styles.th, textAlign: "center" }}>Acciones</th>
            </tr>
            </thead>
            <tbody>
            {/* EL FILTRO FANTASMA: Solo ves a los Super Admins si tú eres Super Admin */}
            {users
                .filter((u) => userData?.rol === "superadmin" || u.rol !== "superadmin")
                .map((u) => (
                <tr key={u.id} style={styles.tr}>
                <td style={styles.td}><b>{u.nombre}</b></td>
                <td style={styles.td}>{u.email}</td>
                <td style={styles.td}>
                    <span style={{
                        ...styles.badge,
                        backgroundColor: u.rol === "admin" ? "#fff3e0" : u.rol === "superadmin" ? "#fce4ec" : "#e3f2fd",
                        color: u.rol === "admin" ? "#e65100" : u.rol === "superadmin" ? "#c2185b" : "#1565c0"
                    }}>
                        {u.rol}
                    </span>
                </td>
                
                <td style={{ ...styles.td, textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                    
                    {/* Botón de Editar: Se oculta para el propio Super Admin */}
                    {(userData?.rol === "admin" || userData?.rol === "superadmin") && !(userData?.rol === "superadmin" && u.id === user.uid) && (
                        <button onClick={() => handleEditUser(u)} style={styles.btnEdit}>
                        Editar
                        </button>
                    )}

                    {/* Botón de Eliminar condicionado por rol Y bloqueando la cuenta propia */}
                    {u.id !== user.uid && (userData?.rol === "superadmin" || (userData?.rol === "admin" && u.rol === "usuario")) && (
                        <button onClick={() => handleDeleteUser(u)} style={styles.btnDelete}>
                        Borrar
                        </button>
                    )}

                </td>
                </tr>
            ))}
            </tbody>
        </table>
        </div>
    </div>

    <div style={{ flex: 1 }}>
        <div style={styles.formCard}>
        <h3 style={{ marginTop: 0 }}>Registrar Nuevo</h3>
        <form onSubmit={handleCreateUser} style={styles.form}>
            <div style={styles.inputGroup}>
            <label>Nombre Completo</label>
            <input
                type="text" required style={styles.input}
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            />
            </div>
            <div style={styles.inputGroup}>
            <label>Correo Electrónico</label>
            <input
                type="email" required style={styles.input}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            </div>
            <div style={styles.inputGroup}>
            <label>Contraseña Provisional</label>
            <input
                type="password" required style={styles.input}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            </div>
            <div style={styles.inputGroup}>
            <label>Rol del Usuario</label>
            <select
                style={styles.input}
                value={formData.rol}
                onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
            >
                <option value="usuario">Usuario Normal</option>
                <option value="admin">Administrador</option>
                {userData?.rol === "superadmin" && (
                <option value="superadmin">Super Administrador</option>
                )}
            </select>
            </div>
            <button type="submit" disabled={loading} style={styles.btnSubmit}>
            {loading ? "Registrando..." : "Crear Cuenta"}
            </button>
        </form>
        </div>
    </div>

    </main>
</div>
);
}

// ==========================================
// ESTILOS ADAPTADOS AL MODO OSCURO
// ==========================================
const styles = {
title: { margin: 0, fontSize: "28px", color: "var(--text-color)", transition: "0.3s" },
subtitle: { color: "var(--text-color)", opacity: 0.7, marginBottom: "30px", transition: "0.3s" },

tableCard: { backgroundColor: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", overflow: "hidden", transition: "0.3s" },
table: { width: "100%", borderCollapse: "collapse" },
theadRow: { backgroundColor: "var(--bg-color)", borderBottom: "2px solid var(--border-color)", transition: "0.3s" },
th: { padding: "15px 20px", textAlign: "left", color: "var(--text-color)", opacity: 0.7, fontSize: "12px", textTransform: "uppercase" },
tr: { borderBottom: "1px solid var(--border-color)", transition: "0.3s" },
td: { padding: "15px 20px", fontSize: "14px", verticalAlign: "middle", color: "var(--text-color)" },

badge: { padding: "4px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" },

formCard: { backgroundColor: "var(--card-bg)", padding: "25px", borderRadius: "12px", border: "1px solid var(--border-color)", boxShadow: "0 4px 10px rgba(0,0,0,0.03)", transition: "0.3s", color: "var(--text-color)" },
form: { display: "flex", flexDirection: "column", gap: "15px" },
inputGroup: { display: "flex", flexDirection: "column", gap: "5px", color: "var(--text-color)" },
input: { padding: "10px", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "14px", backgroundColor: "transparent", color: "var(--text-color)", transition: "0.3s" },

btnSubmit: { backgroundColor: "#ff6600", color: "white", border: "none", padding: "12px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", marginTop: "10px", transition: "0.3s" },
btnEdit: { backgroundColor: "#ffc107", color: "#000", border: "none", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px", transition: "0.3s" },
btnDelete: { backgroundColor: "#d32f2f", color: "white", border: "none", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px", transition: "0.3s" }
};