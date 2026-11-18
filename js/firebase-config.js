import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Reemplazar con los datos de tu proyecto de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA79prb_JIM89_ckM5dP7e8m4IFHJitjy0",
  authDomain: "al-punto-viandas.firebaseapp.com",
  projectId: "al-punto-viandas",
  storageBucket: "al-punto-viandas.firebasestorage.app",
  messagingSenderId: "667095537247",
  appId: "1:667095537247:web:84a643d120aebd82abadea"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);