import { db, auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let allOrders = [];
let allCustomers = [];

// Control de sesión
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("dashboard-container").classList.remove("hidden");
    await Promise.all([loadAdminData(), loadOrdersAndCustomers()]);
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

// Navegación entre pestañas del panel
document.querySelectorAll(".dash-tab").forEach(tabBtn => {
  tabBtn.addEventListener("click", () => {
    const targetTab = tabBtn.dataset.tab;
    document.querySelectorAll(".dash-tab").forEach(b => b.classList.toggle("active", b === tabBtn));
    document.querySelectorAll(".dash-panel").forEach(panel => {
      panel.classList.toggle("hidden", panel.id !== `tab-${targetTab}`);
    });
  });
});

// Cargar configuración de tienda
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

// Cargar pedidos y clientes desde Firestore
async function loadOrdersAndCustomers() {
  try {
    const ordersSnap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
    allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const customersSnap = await getDocs(collection(db, "customers"));
    allCustomers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allCustomers.sort((a, b) => (b.ordersCount || 0) - (a.ordersCount || 0));

    renderStats();
    renderOrders();
    renderCustomers();
  } catch (err) {
    console.error("Error al cargar pedidos o clientes:", err);
  }
}

function getOrderDate(order) {
  if (!order.createdAt) return null;
  if (typeof order.createdAt.toDate === "function") return order.createdAt.toDate();
  return new Date(order.createdAt);
}

function isWithinPeriod(date, period) {
  if (period === "all") return true;
  if (!date) return false;

  const now = new Date();
  if (period === "today") {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }
  if (period === "week") {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return date >= sevenDaysAgo;
  }
  if (period === "month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  return true;
}

// Renderizar estadísticas sobre pedidos confirmados
function renderStats() {
  const period = document.getElementById("stats-period").value;
  const confirmedOrders = allOrders.filter(o => {
    if (o.status !== "confirmado") return false;
    return isWithinPeriod(getOrderDate(o), period);
  });

  const revenue = confirmedOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const viandas = confirmedOrders.reduce((sum, o) => sum + Number(o.totalQty || 0), 0);
  const count = confirmedOrders.length;
  const avgTicket = count > 0 ? Math.round(revenue / count) : 0;

  const transferTotal = confirmedOrders
    .filter(o => (o.paymentMethod || "").toLowerCase().includes("transferencia"))
    .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

  const mpTotal = confirmedOrders
    .filter(o => (o.paymentMethod || "").toLowerCase().includes("mercado pago"))
    .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

  document.getElementById("stat-revenue").textContent = `$${revenue}`;
  document.getElementById("stat-viandas").textContent = viandas;
  document.getElementById("stat-orders-count").textContent = count;
  document.getElementById("stat-avg-ticket").textContent = `$${avgTicket}`;
  document.getElementById("stat-transfer").textContent = `$${transferTotal}`;
  document.getElementById("stat-mp").textContent = `$${mpTotal}`;
}

document.getElementById("stats-period").addEventListener("change", renderStats);

// Renderizar historial de pedidos
function renderOrders() {
  const statusFilter = document.getElementById("filter-order-status").value;
  const listEl = document.getElementById("orders-list");

  const filtered = allOrders.filter(o => {
    if (statusFilter === "all") return true;
    return (o.status || "pendiente") === statusFilter;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="empty-gallery-msg">No hay pedidos para mostrar con este filtro.</p>`;
    return;
  }

  listEl.innerHTML = filtered.map(order => {
    const dt = getOrderDate(order);
    const dateLabel = dt ? dt.toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" }) : "Recién registrado";
    const status = order.status || "pendiente";
    const itemsHtml = (order.items || [])
      .map(it => `<li>• ${it.qty}x ${it.name} (${it.day})</li>`)
      .join("");

    return `
      <article class="order-card">
        <div class="order-top">
          <div>
            <strong>${order.customerName || "Cliente"}</strong>
            <span class="order-date">${dateLabel} · ${order.customerPhone || ""}</span>
          </div>
          <span class="status-badge status-${status}">${status}</span>
        </div>

        <ul class="order-items-list">${itemsHtml}</ul>

        <div class="order-meta">
          <div>💳 Pago: <strong>${order.paymentMethod || "-"}</strong></div>
          ${order.address ? `<div>📍 Dirección: ${order.address}</div>` : ""}
          ${order.notes ? `<div>📝 Notas: ${order.notes}</div>` : ""}
        </div>

        <div class="order-footer-bar">
          <strong>Total: $${order.totalAmount || 0} (${order.totalQty || 0} viandas)</strong>
          <div class="order-actions">
            ${status !== "confirmado" ? `<button type="button" class="btn-sm btn-confirm" data-action="confirm" data-id="${order.id}">Confirmar</button>` : ""}
            ${status !== "cancelado" ? `<button type="button" class="btn-sm btn-cancel" data-action="cancel" data-id="${order.id}">Cancelar</button>` : ""}
            <button type="button" class="btn-sm btn-remove" data-action="delete" data-id="${order.id}">Borrar</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  listEl.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => handleOrderAction(btn.dataset.id, btn.dataset.action));
  });
}

async function handleOrderAction(orderId, action) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  const orderRef = doc(db, "orders", orderId);

  if (action === "confirm") {
    const wasConfirmed = order.status === "confirmado";
    await updateDoc(orderRef, { status: "confirmado" });

    if (!wasConfirmed && order.customerId) {
      const custRef = doc(db, "customers", order.customerId);
      const custSnap = await getDoc(custRef);
      if (custSnap.exists()) {
        await setDoc(custRef, {
          totalConfirmedSpent: increment(Number(order.totalAmount || 0))
        }, { merge: true });
      }
    }
  } else if (action === "cancel") {
    await updateDoc(orderRef, { status: "cancelado" });
  } else if (action === "delete") {
    const ok = confirm("¿Eliminar este pedido del historial?");
    if (!ok) return;
    await deleteDoc(orderRef);
  }

  await loadOrdersAndCustomers();
}

document.getElementById("filter-order-status").addEventListener("change", renderOrders);

// Renderizar base de clientes
function renderCustomers() {
  const queryText = document.getElementById("search-customer").value.trim().toLowerCase();
  const listEl = document.getElementById("customers-list");

  const filtered = allCustomers.filter(c => {
    if (!queryText) return true;
    const nameMatch = (c.name || "").toLowerCase().includes(queryText);
    const phoneMatch = (c.phone || "").toLowerCase().includes(queryText);
    return nameMatch || phoneMatch;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="empty-gallery-msg">No se encontraron clientes.</p>`;
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const waDigits = (c.phone || "").replace(/\D/g, "");
    const waLink = waDigits ? `<a href="https://wa.me/${waDigits}" target="_blank" rel="noopener noreferrer" class="wa-direct-link">WhatsApp ↗</a>` : "";

    return `
      <article class="customer-card">
        <div class="customer-top">
          <div>
            <strong>${c.name || "Sin nombre"}</strong>
            <div class="order-date">${c.phone || ""}</div>
          </div>
          ${waLink}
        </div>
        ${c.lastAddress ? `<div class="order-meta">📍 Última dirección: ${c.lastAddress}</div>` : ""}
        <div class="customer-stats">
          <span>Pedidos: ${c.ordersCount || 0}</span>
          <span>Viandas: ${c.totalViandas || 0}</span>
          <span>Confirmado: $${c.totalConfirmedSpent || 0}</span>
        </div>
      </article>
    `;
  }).join("");
}

document.getElementById("search-customer").addEventListener("input", renderCustomers);

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