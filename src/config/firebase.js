// src/config/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Las mismas credenciales que usas en tu app móvil
const firebaseConfig = {
    apiKey: "AIzaSyCb43aVyAPrDuYLpqBEbNgwPFaqNMilFus",
    authDomain: "sigat-627cd.firebaseapp.com",
    projectId: "sigat-627cd",
    storageBucket: "sigat-627cd.firebasestorage.app",
    messagingSenderId: "729844215540",
    appId: "1:729844215540:web:060c9179bd15a8ec0bb8a1",
    measurementId: "G-D6VRF6QJH2",
};

// 1. Inicializamos la App de Firebase
const app = initializeApp(firebaseConfig);

// 2. Inicializamos Firestore (Base de datos)
export const db = getFirestore(app);

// 3. Inicializamos Auth (Para el Login web)
export const auth = getAuth(app);