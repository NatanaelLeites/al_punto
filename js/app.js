import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Estado inicial con los datos reales proporcionados por la clienta
let appData = {
  whatsappNumber: "59899000000", // Cambiar por el número real sin el +
  unitPrice: 360,
  promoPrice: 320,
  promoMinQty: 5,
  scheduleText: "Pedidos el día anterior o hasta las 09:00 hs del mismo día (sujeto a disponibilidad).",
  deliveryZones: "Entregas en Montevideo de Lunes a Viernes de 10:30 a 14:00 hs.",
  gallery: [
    { url: "assets/canelones.jpg", title: "Canelones gratinados" },
    { url: "assets/pollo.jpg", title: "Pollo grillado con papas" },
    { url: "assets/tarta.jpg", title: "Tarta integral con ensalada" },
    { url: "assets/wok.jpg", title: "Wok de pollo y vegetales" }
  ],
  menu: {
    Lunes: [
      "Pollo grillado con papas al horno",
      "Canelones de carne y verdura con salsa blanca gratinada",
      "Tarta de zapallitos y pollo con masa integral y ensalada"
    ],
    Martes: [
      "Milanesas de carne con puré",
      "Chop suey con fideos integrales",
      "Tortilla de papas con ensalada verde"
    ],
    Miércoles: [
      "Milanesa de pescado con puré de papas",
      "Pastel de carne con ensalada verde",
      "Zapallitos rellenos de carne, salsa blanca y queso con ensalada"
    ],
    Jueves: [
      "Bife a la portuguesa con puré rústico",
      "Strogonoff de pollo",
      "Tarta de atún con ensalada de repollo, zanahoria y tomate"
    ],
    Viernes: [
      "Hamburguesas caseras con puré cremoso",
      "Wok de pollo con verduras y fideos integrales",
      "Omelette de espinaca y queso con ensalada verde"
    ]
  }
};

let activeDay = "Lunes";
let cart = []; // { id, day, name, qty }

// Intentar cargar datos actualizados desde Firestore
async function loadFromFirebase() {
  try {
    const docRef = doc(db, "config", "storeData");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      appData = { ...appData, ...snap.data() };
    }
  } catch (error) {
    console.warn("Usando datos locales por defecto (Firebase aún no configurado):", error.message);
  }
  renderUI();
}

function renderUI() {
  document.getElementById("display-unit-price").textContent = appData.unitPrice;
  document.getElementById("display-promo-price").textContent = appData.promoPrice;
  document.getElementById("schedule-info").textContent = appData.scheduleText;
  document.getElementById("delivery-zones").textContent = appData.deliveryZones;

  renderGallery();
  renderMenu(activeDay);
}

function renderGallery() {
  const track = document.getElementById("gallery-track");
  track.innerHTML = appData.gallery.map(item => `
    <article class="gallery-card">
      <img src="${item.url}" alt="${item.title}" loading="lazy" />
      <p>${item.title}</p>
    </article>
  `).join("");
}

function renderMenu(day) {
  activeDay = day;
  document.querySelectorAll(".day-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.day === day);
  });

  const dishes = appData.menu[day] || [];
  const menuList = document.getElementById("menu-list");

  menuList.innerHTML = dishes.map((dish) => `
    <div class="dish-card">
      <div class="dish-info">
        <span class="dish-day-tag">${day}</span>
        <h4>${dish}</h4>
      </div>
      <button class="btn-add" data-day="${day}" data-name="${dish}">+ Agregar</button>
    </div>
  `).join("");

  menuList.querySelectorAll(".btn-add").forEach(btn => {
    btn.addEventListener("click", () => {
      addToCart(btn.dataset.day, btn.dataset.name);
    });
  });
}

function addToCart(day, name) {
  const id = `${day}-${name}`;
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id, day, name, qty: 1 });
  }
  updateCartUI();
}

function updateQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.id !== id);
  }
  updateCartUI();
}

function updateCartUI() {
  const totalQty = cart.reduce((acc, item) => acc + item.qty, 0);
  const isPromo = totalQty >= appData.promoMinQty;
  const currentUnitPrice = isPromo ? appData.promoPrice : appData.unitPrice;
  const totalAmount = totalQty * currentUnitPrice;

  document.getElementById("cart-count").textContent = totalQty;
  const stickyBar = document.getElementById("sticky-cart-bar");
  if (totalQty > 0) {
    stickyBar.classList.remove("hidden");
    document.getElementById("sticky-qty").textContent = `${totalQty} ${totalQty === 1 ? "vianda" : "viandas"}`;
    document.getElementById("sticky-total").textContent = `$${totalAmount}`;
  } else {
    stickyBar.classList.add("hidden");
  }

  const promoBanner = document.getElementById("promo-progress");
  if (totalQty === 0) {
    promoBanner.textContent = `Llevando ${appData.promoMinQty} viandas pagás $${appData.promoPrice} c/u.`;
  } else if (!isPromo) {
    const missing = appData.promoMinQty - totalQty;
    promoBanner.textContent = `¡Agregá ${missing} más para acceder a la promo de $${appData.promoPrice} c/u!`;
  } else {
    promoBanner.textContent = `🎉 ¡Promo activada! Pagás $${appData.promoPrice} por cada vianda.`;
  }

  const cartItemsEl = document.getElementById("cart-items");
  if (cart.length === 0) {
    cartItemsEl.innerHTML = `<p style="text-align:center;color:#6b7280;margin-top:20px;">Tu carrito está vacío.</p>`;
  } else {
    cartItemsEl.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div>
          <strong>${item.name}</strong>
          <div style="font-size:0.78rem;color:#6b7280;">Día: ${item.day}</div>
        </div>
        <div class="qty-controls">
          <button class="qty-btn" data-id="${item.id}" data-delta="-1">-</button>
          <span>${item.qty}</span>
          <button class="qty-btn" data-id="${item.id}" data-delta="1">+</button>
        </div>
      </div>
    `).join("");

    cartItemsEl.querySelectorAll(".qty-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        updateQty(btn.dataset.id, Number(btn.dataset.delta));
      });
    });
  }

  document.getElementById("drawer-total").textContent = `$${totalAmount}`;
}

// Enviar pedido formateado a WhatsApp
function sendWhatsAppOrder() {
  if (cart.length === 0) return;

  const totalQty = cart.reduce((acc, item) => acc + item.qty, 0);
  const isPromo = totalQty >= appData.promoMinQty;
  const currentUnitPrice = isPromo ? appData.promoPrice : appData.unitPrice;
  const totalAmount = totalQty * currentUnitPrice;

  const address = document.getElementById("customer-address").value.trim();
  const notes = document.getElementById("customer-notes").value.trim();
  const paymentMethod = document.getElementById("payment-method").value;

  let message = `Hola *Al Punto*! Quiero hacer el siguiente pedido:\n\n`;
  cart.forEach(item => {
    message += `• ${item.qty}x ${item.name} _(${item.day})_\n`;
  });

  message += `\n*Cantidad total:* ${totalQty} viandas`;
  message += `\n*Tarifa aplicada:* $${currentUnitPrice} c/u ${isPromo ? "(Promo Semanal)" : ""}`;
  message += `\n*Total estimado:* $${totalAmount}`;
  message += `\n💳 *Forma de pago:* ${paymentMethod}`;

  if (address) message += `\n\n📍 *Dirección:* ${address}`;
  else message += `\n\n📍 *Dirección:* (Escribo mi dirección acá)`;

  if (notes) message += `\n📝 *Aclaraciones:* ${notes}`;

  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${appData.whatsappNumber}?text=${encoded}`, "_blank");
}

// Listeners generales
document.querySelectorAll(".day-tab").forEach(btn => {
  btn.addEventListener("click", () => renderMenu(btn.dataset.day));
});

const drawer = document.getElementById("cart-drawer");
const overlay = document.getElementById("cart-overlay");

function toggleDrawer(open) {
  drawer.classList.toggle("open", open);
  overlay.classList.toggle("hidden", !open);
}

document.getElementById("open-cart-btn").addEventListener("click", () => toggleDrawer(true));
document.getElementById("sticky-open-btn").addEventListener("click", () => toggleDrawer(true));
document.getElementById("close-cart-btn").addEventListener("click", () => toggleDrawer(false));
overlay.addEventListener("click", () => toggleDrawer(false));
document.getElementById("send-whatsapp-btn").addEventListener("click", sendWhatsAppOrder);

// Inicializar
loadFromFirebase();
updateCartUI();