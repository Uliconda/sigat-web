// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

// 1. Creamos el contexto
const AuthContext = createContext();

// 2. Creamos el Provider (el componente que envolverá nuestra app)
export function AuthProvider({ children }) {
const [user, setUser] = useState(null);
const [userData, setUserData] = useState(null);
const [loading, setLoading] = useState(true); // Para mostrar una carga mientras verificamos la sesión

useEffect(() => {
    // Escuchamos los cambios de sesión de Firebase
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
    setUser(currentUser);

    if (currentUser) {
        // Si hay alguien logueado, buscamos su rol en Firestore
        try {
            const docRef = doc(db, "Usuarios", currentUser.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
            setUserData(docSnap.data()); // Guardamos su nombre, email y ROL
        } else {
            console.log("El usuario no tiene un documento en la colección 'Usuarios'");
            setUserData(null);
        }
        } catch (error) {
            console.error("Error obteniendo datos del usuario:", error);
        }
    } else {
        // Si cierra sesión, limpiamos los datos
        setUserData(null);
    }

      setLoading(false); // Ya terminamos de verificar
    });

    return () => unsubscribe();
}, []);

  // 3. Compartimos estos valores con toda la aplicación
return (
    <AuthContext.Provider value={{ user, userData, loading }}>
    {!loading && children} 
      {/* El !loading evita que la app parpadee o muestre cosas sin antes saber si hay sesión */}
    </AuthContext.Provider>
);
}

// 4. Creamos un "Hook" personalizado para que sea facilísimo usarlo en otras pantallas
export const useAuth = () =>  { 
return useContext(AuthContext);
};

