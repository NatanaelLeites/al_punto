import { db, auth } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentData = {
  unitPrice: 360,
  promoPrice: 320,
  whatsappNumber: "59899000000",
  gallery: [],
  menu: {
    Lunes: ["Pollo grillado con papas al horno"],
    Martes: ["Milanesas de carne con puré"],
    Miércoles: ["Milanesa de pescado con puré de papas"],
    Jueves: ["Bife a la portuguesa con puré rústico"],
    Viernes: ["Hamburguesas caseras con puré cremoso"]
  }
};

// Control de sesión
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("dashboard-container").classList.remove("hidden");
    await loadAdminData();
  } else {
    document.getElementById("login-container").classList.remove("hidden");
    document.getElementById("dashboard-container").classList.add("hidden");
  }
});

// Login
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const pass = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    errorEl.textContent = "";
  } catch (err) {
    errorEl.textContent = "Error al ingresar. Verificá tus datos.";
  }
});

// Logout
document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

// Cargar datos actuales en el panel
async function loadAdminData() {
  try {
    const docRef = doc(db, "config", "storeData");
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      currentData = snap.data();
      if (!currentData.menu) currentData.menu = {};
      if (!currentData.gallery) currentData.gallery = [];
    } else {
      await setDoc(docRef, currentData);
    }

    document.getElementById("cfg-unit-price").value = currentData.unitPrice || 360;
    document.getElementById("cfg-promo-price").value = currentData.promoPrice || 320;
    document.getElementById("cfg-whatsapp").value = currentData.whatsappNumber || "";

    renderAdminGallery();
    populateMenuEditor();
  } catch (err) {
    console.error("Error al cargar datos de admin:", err);
  }
}

// Renderizar galería con opción de eliminar cada foto
function renderAdminGallery() {
  const listEl = document.getElementById("admin-gallery-list");
  if (!currentData.gallery || currentData.gallery.length === 0) {
    listEl.innerHTML = `<p class="empty-gallery-msg">No hay fotos cargadas todavía.</p>`;
    return;
  }

  listEl.innerHTML = currentData.gallery.map((item, index) => `
    <div class="admin-gallery-item">
      <div class="admin-gallery-info">
        <img src="${item.url}" alt="${item.title}" class="admin-gallery-thumb" />
        <span class="admin-gallery-title">${item.title}</span>
      </div>
      <button type="button" class="btn-delete-photo" data-index="${index}">Eliminar</button>
    </div>
  `).join("");

  listEl.querySelectorAll(".btn-delete-photo").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.index);
      const item = currentData.gallery[idx];
      if (!item) return;

      const confirmed = confirm(`¿Eliminar la foto "${item.title}" de la web?`);
      if (!confirmed) return;

      currentData.gallery.splice(idx, 1);
      await setDoc(doc(db, "config", "storeData"), currentData, { merge: true });
      renderAdminGallery();
    });
  });
}

// Guardar Configuración y Precios
document.getElementById("config-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentData) return;

  currentData.unitPrice = Number(document.getElementById("cfg-unit-price").value);
  currentData.promoPrice = Number(document.getElementById("cfg-promo-price").value);
  currentData.whatsappNumber = document.getElementById("cfg-whatsapp").value.trim();

  await setDoc(doc(db, "config", "storeData"), currentData, { merge: true });
  alert("¡Precios y configuración actualizados con éxito!");
});

// Procesar imagen y guardarla comprimida en Firestore
document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentData) return;

  const fileInput = document.getElementById("image-file");
  const title = document.getElementById("image-title").value.trim();
  const file = fileInput.files[0];

  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 800;
      const scaleSize = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
      canvas.width = img.width * scaleSize;
      canvas.height = img.height * scaleSize;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);

      if (!currentData.gallery) currentData.gallery = [];
      currentData.gallery.push({ url: compressedDataUrl, title });

      await setDoc(doc(db, "config", "storeData"), currentData, { merge: true });
      renderAdminGallery();
      alert("¡Foto subida y guardada con éxito en la base de datos!");
      fileInput.value = "";
      document.getElementById("image-title").value = "";
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Editor de Menú
const selectDay = document.getElementById("select-day");
const textareaDishes = document.getElementById("day-dishes-input");

function populateMenuEditor() {
  if (!currentData) return;
  const day = selectDay.value;
  const dishes = currentData.menu[day] || [];
  textareaDishes.value = dishes.join("\n");
}

selectDay.addEventListener("change", populateMenuEditor);

document.getElementById("save-menu-btn").addEventListener("click", async () => {
  if (!currentData) return;
  const day = selectDay.value;
  const lines = textareaDishes.value.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  if (!currentData.menu) currentData.menu = {};
  currentData.menu[day] = lines;

  await setDoc(doc(db, "config", "storeData"), currentData, { merge: true });
  alert(`¡Menú del día ${day} actualizado con éxito!`);
});

document.getElementById("clear-day-btn").addEventListener("click", async () => {
  if (!currentData) return;
  const day = selectDay.value;
  const confirmed = confirm(`¿Seguro que querés borrar todos los platos del ${day}?`);
  if (!confirmed) return;

  if (!currentData.menu) currentData.menu = {};
  currentData.menu[day] = [];
  textareaDishes.value = "";

  await setDoc(doc(db, "config", "storeData"), currentData, { merge: true });
  alert(`Se vació el menú del día ${day}.`);
});