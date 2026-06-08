// Configuración de Firebase (compartida por las dos páginas)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js"
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js"

// IMPORTANTE: reemplaza apiKey con tu valor real (Consola de Firebase → Configuración del proyecto).
const firebaseConfig = {
  apiKey: "AIzaSyCy2neYa1tS0HRh7Wp_KBALPs70WrY1Elk",
  authDomain: "baloncesto-d6ee1.firebaseapp.com",
  projectId: "baloncesto-d6ee1",
  storageBucket: "baloncesto-d6ee1.firebasestorage.app",
  messagingSenderId: "534278821793",
  appId: "1:534278821793:web:8e77a68b8614ad97a51de0",
  measurementId: "G-ZHEKD0XVW9",
}

// Inicializa Firebase de forma segura. Si falla (config inválida, sin red, etc.)
// NO rompe el resto de la página: `db` queda en null y mostramos un aviso.
let db = null
let firebaseError = null
let configIncompleta = false

try {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "TU_API_KEY") {
    configIncompleta = true
  }
  const app = initializeApp(firebaseConfig)
  db = getFirestore(app)
} catch (err) {
  firebaseError = err
  console.error("[v0] Error al inicializar Firebase:", err)
}

export {
  db,
  firebaseError,
  configIncompleta,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
}
