import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DELIVERY_CUTOFF_HOUR = 14; // Después de las 14:00 hs se prioriza el próximo día hábil

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

function getSchedulingContext() {
  const now = new Date();
  const jsDay = now.getDay(); // 0: Dom, 1: Lun ... 5: Vie, 6: Sáb
  const hour = now.getHours();

  // Fin de semana: toda la semana hábil está disponible y arranca en Lunes
  if (jsDay === 0 || jsDay === 6) {
    return {
      defaultDay: "Lunes",
      firstOrderableIndex: 0,
      todayIndex: -1,
      afterDeliveryCutoff: false
    };
  }

  const todayIdx = jsDay - 1; // 0..4
  const afterCutoff = hour >= DELIVERY_CUTOFF_HOUR;

  // Si ya pasó el horario de reparto del día (ej. noche), el próximo pedido es para el día siguiente
  if (afterCutoff) {
    const nextIdx = todayIdx < WEEKDAYS.length - 1 ? todayIdx + 1 : 0;
    return {
      defaultDay: WEEKDAYS[nextIdx],
      firstOrderableIndex: todayIdx < WEEKDAYS.length - 1 ? todayIdx + 1 : 0,
      todayIndex: todayIdx,
      afterDeliveryCutoff: true
    };
  }

  return {
    defaultDay: WEEKDAYS[todayIdx],
    firstOrderableIndex: todayIdx,
    todayIndex: todayIdx,
    afterDeliveryCutoff: false
  };
}

const scheduleCtx = getSchedulingContext();
let activeDay = scheduleCtx.defaultDay;
let cart = []; // { id, day, deliveryLabel, name, qty }

function getDeliveryLabelForDay(day) {
  const idx = WEEKDAYS.indexOf(day);
  if (idx === -1) return day;

  if (scheduleCtx.todayIndex !== -1 && !scheduleCtx.afterDeliveryCutoff && idx === scheduleCtx.todayIndex) {
    return `${day} (hoy)`;
  }

  if (scheduleCtx.todayIndex !== -1 && idx === scheduleCtx.todayIndex + 1) {
    return `${day} (mañana)`;
  }

  return `${day}`;
}

function isDayOrderable(day) {
  const idx = WEEKDAYS.indexOf(day);
  if (idx === -1) return false;

  // Si es viernes después de las 14:00, el ciclo siguiente arranca el Lunes
  if (scheduleCtx.todayIndex === WEEKDAYS.length - 1 && scheduleCtx.afterDeliveryCutoff) {
    return true;
  }

  return idx >= scheduleCtx.firstOrderableIndex;
}

// Intentar cargar datos actualizados desde Firestore
async function loadFromFirebase() {
  try {
    const docRef = doc(db, "config", "storeData");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      appData = { ...appData, ...snap.data() };
    }
  } catch (error) {
    console.warn("Usando datos locales por defecto:", error.message);
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
    const isSelected = btn.dataset.day === day;
    btn.classList.toggle("active", isSelected);
    btn.setAttribute("aria-selected", isSelected ? "true" : "false");
  });

  const dishes = appData.menu[day] || [];
  const menuList = document.getElementById("menu-list");
  const canOrder = isDayOrderable(day);
  const deliveryLabel = getDeliveryLabelForDay(day);

  let statusHint = "";
  if (!canOrder) {
    statusHint = `<p class="today-hint">${day} ya pasó en esta semana: podés mirar el menú o elegir un día próximo para pedir.</p>`;
  } else if (scheduleCtx.todayIndex !== -1 && !scheduleCtx.afterDeliveryCutoff && WEEKDAYS.indexOf(day) === scheduleCtx.todayIndex) {
    statusHint = `<p class="today-hint">Hoy es ${day}: podés pedir para entrega hoy o programar días siguientes.</p>`;
  } else {
    statusHint = `<p class="today-hint">Pedido programado con entrega para ${deliveryLabel}.</p>`;
  }

  if (dishes.length === 0) {
    menuList.innerHTML = `${statusHint}<p style="color:#6b7280;font-size:0.9rem;">No hay platos cargados para ${day}.</p>`;
    return;
  }

  const cardsHtml = dishes.map((dish) => {
    if (!canOrder) {
      return `
        <div class="dish-card dish-card--past">
          <div class="dish-info">
            <span class="dish-day-tag">${day}</span>
            <h4>${dish}</h4>
          </div>
          <span class="dish-past-badge">Día pasado</span>
        </div>
      `;
    }

    return `
      <div class="dish-card">
        <div class="dish-info">
          <span class="dish-day-tag">Entrega: ${deliveryLabel}</span>
          <h4>${dish}</h4>
        </div>
        <button type="button" class="btn-add" data-day="${day}" data-name="${dish}">+ Agregar</button>
      </div>
    `;
  }).join("");

  menuList.innerHTML = statusHint + cardsHtml;

  if (canOrder) {
    menuList.querySelectorAll(".btn-add").forEach(btn => {
      btn.addEventListener("click", () => {
        addToCart(btn.dataset.day, btn.dataset.name);
      });
    });
  }
}

function addToCart(day, name) {
  const deliveryLabel = getDeliveryLabelForDay(day);
  const id = `${day}-${name}`;
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id, day, deliveryLabel, name, qty: 1 });
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
          <div style="font-size:0.78rem;color:#6b7280;">Entrega: ${item.deliveryLabel || item.day}</div>
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

function normalizePhone(rawPhone) {
  return rawPhone.replace(/\D/g, "");
}

function resetOrderFormAndCart() {
  cart = [];
  document.getElementById("customer-name").value = "";
  document.getElementById("customer-phone").value = "";
  document.getElementById("customer-address").value = "";
  document.getElementById("customer-notes").value = "";
  document.getElementById("payment-method").selectedIndex = 0;
  updateCartUI();
}

function showOrderConfirmation(customerName, totalAmount) {
  const box = document.getElementById("order-confirmation");
  const detail = document.getElementById("confirmation-detail");
  detail.textContent = `Gracias${customerName ? `, ${customerName}` : ""}. Tu pedido por $${totalAmount} quedó registrado y se abrió WhatsApp.`;
  box.classList.remove("hidden");
}

function hideOrderConfirmation() {
  document.getElementById("order-confirmation").classList.add("hidden");
}

// Registrar pedido y actualizar base de clientes en Firestore
async function saveOrderAndCustomer({ customerName, rawPhone, cleanPhone, address, notes, paymentMethod, totalQty, unitPrice, totalAmount, isPromo }) {
  await addDoc(collection(db, "orders"), {
    customerName,
    customerPhone: rawPhone,
    customerId: cleanPhone,
    address: address || "",
    notes: notes || "",
    paymentMethod,
    items: cart.map(item => ({
      day: item.day,
      deliveryLabel: item.deliveryLabel || item.day,
      name: item.name,
      qty: item.qty
    })),
    totalQty,
    unitPrice,
    isPromo,
    totalAmount,
    status: "pendiente",
    createdAt: serverTimestamp()
  });

  if (cleanPhone) {
    const customerRef = doc(db, "customers", cleanPhone);
    const customerSnap = await getDoc(customerRef);

    if (customerSnap.exists()) {
      await setDoc(customerRef, {
        name: customerName,
        phone: rawPhone,
        lastAddress: address || customerSnap.data().lastAddress || "",
        lastPaymentMethod: paymentMethod,
        ordersCount: increment(1),
        totalViandas: increment(totalQty),
        totalEstimatedSpent: increment(totalAmount),
        lastOrderAt: serverTimestamp()
      }, { merge: true });
    } else {
      await setDoc(customerRef, {
        name: customerName,
        phone: rawPhone,
        lastAddress: address || "",
        lastPaymentMethod: paymentMethod,
        ordersCount: 1,
        totalViandas: totalQty,
        totalEstimatedSpent: totalAmount,
        createdAt: serverTimestamp(),
        lastOrderAt: serverTimestamp()
      });
    }
  }
}

// Enviar pedido formateado a WhatsApp
async function sendWhatsAppOrder() {
  if (cart.length === 0) return;

  const sendBtn = document.getElementById("send-whatsapp-btn");
  const customerName = document.getElementById("customer-name").value.trim();
  const rawPhone = document.getElementById("customer-phone").value.trim();
  const cleanPhone = normalizePhone(rawPhone);
  const address = document.getElementById("customer-address").value.trim();
  const notes = document.getElementById("customer-notes").value.trim();
  const paymentMethod = document.getElementById("payment-method").value;

  if (!customerName) {
    alert("Por favor, ingresá tu nombre para continuar.");
    document.getElementById("customer-name").focus();
    return;
  }

  if (cleanPhone.length < 7) {
    alert("Por favor, ingresá un teléfono o WhatsApp válido.");
    document.getElementById("customer-phone").focus();
    return;
  }

  const totalQty = cart.reduce((acc, item) => acc + item.qty, 0);
  const isPromo = totalQty >= appData.promoMinQty;
  const currentUnitPrice = isPromo ? appData.promoPrice : appData.unitPrice;
  const totalAmount = totalQty * currentUnitPrice;

  sendBtn.disabled = true;
  sendBtn.textContent = "Registrando pedido...";

  let message = `Hola *Al Punto*! Soy *${customerName}* (${rawPhone}). Quiero hacer el siguiente pedido:\n\n`;
  cart.forEach(item => {
    message += `• ${item.qty}x ${item.name} — _Entrega: ${item.deliveryLabel || item.day}_\n`;
  });

  message += `\n*Cantidad total:* ${totalQty} viandas`;
  message += `\n*Tarifa aplicada:* $${currentUnitPrice} c/u ${isPromo ? "(Promo Semanal)" : ""}`;
  message += `\n*Total estimado:* $${totalAmount}`;
  message += `\n💳 *Forma de pago:* ${paymentMethod}`;

  if (address) message += `\n\n📍 *Dirección:* ${address}`;
  else message += `\n\n📍 *Dirección:* (Escribo mi dirección acá)`;

  if (notes) message += `\n📝 *Aclaraciones:* ${notes}`;

  try {
    await saveOrderAndCustomer({
      customerName,
      rawPhone,
      cleanPhone,
      address,
      notes,
      paymentMethod,
      totalQty,
      unitPrice: currentUnitPrice,
      totalAmount,
      isPromo
    });
    resetOrderFormAndCart();
    showOrderConfirmation(customerName, totalAmount);
  } catch (err) {
    console.warn("No se pudo guardar el pedido en Firestore:", err.message);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Confirmar por WhatsApp";
  }

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

document.getElementById("open-cart-btn").addEventListener("click", () => {
  hideOrderConfirmation();
  toggleDrawer(true);
});
document.getElementById("sticky-open-btn").addEventListener("click", () => {
  hideOrderConfirmation();
  toggleDrawer(true);
});
document.getElementById("close-cart-btn").addEventListener("click", () => toggleDrawer(false));
document.getElementById("close-confirmation-btn").addEventListener("click", hideOrderConfirmation);
overlay.addEventListener("click", () => toggleDrawer(false));
document.getElementById("send-whatsapp-btn").addEventListener("click", sendWhatsAppOrder);

// Inicializar
loadFromFirebase();
updateCartUI();