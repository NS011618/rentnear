import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// Firebase web configuration (client-side config is expected to be public).
// Protect access with Firebase Authentication and the rules shipped with this repo.
const firebaseConfig = {
  apiKey: "AIzaSyB1i0K2KuhAmg6UoIWtCBwAtdFWFqHuflo",
  authDomain: "it0108.firebaseapp.com",
  databaseURL: "https://it0108-default-rtdb.firebaseio.com",
  projectId: "it0108",
  storageBucket: "it0108.firebasestorage.app",
  messagingSenderId: "33850117745",
  appId: "1:33850117745:web:a3ce174eb56054f345d5d0",
  measurementId: "G-Z2TJFVGKN0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export default app;
