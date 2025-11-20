// js/app.js — Navbar + badges + carrito por usuario + modal acceso
(() => {
  // URL base de mi API
const API = "https://vivero-back.onrender.com";

  // Atajo rápido para buscar un elemento en el DOM
  const $  = (s) => document.querySelector(s);

  // ---------- sesión ----------
  // Aquí obtengo el token JWT que guardo al hacer login
  function getToken() {
    return localStorage.getItem("token") || sessionStorage.getItem("token") || null;
  }
  // Devuelve true si hay token, o sea si el usuario está logueado
  function isLoggedIn() {
    return !!getToken();
  }
  // Con esto leo el payload del token JWT y saco los datos del usuario
  function getClaims() {
    const t = getToken();
    if (!t) return null;
    const p = t.split(".");
    if (p.length !== 3) return null;
    try {
      const b64 = p[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
  // Esta función me arma la clave del carrito por usuario usando el id del token
  function cartKey() {
    const c = getClaims();
    return c?.id ? `lc_cart_${c.id}` : null;
  }

  // ---------- util dinero ----------
  // Formateo números a pesos colombianos, sin decimales
  function fmtCOP(n) {
    return Number(n || 0).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0
    });
  }

  // ---------- migración: fusiona carrito viejo (lc_cart) al de usuario ----------
  // Aquí mezclo el carrito viejo (sin usuario) al carrito asociado al usuario logueado
  function migrateLegacyCart() {
    const legacyRaw = localStorage.getItem("lc_cart");
    if (!legacyRaw) return;
    let legacy = [];
    try { legacy = JSON.parse(legacyRaw) || []; } catch { legacy = []; }

    const key = cartKey();
    if (!key) return;
    let userCart = [];
    try { userCart = JSON.parse(localStorage.getItem(key)) || []; } catch { userCart = []; }

    // Recorro los items del carrito viejo y los sumo al carrito del usuario
    for (const it of legacy) {
      const ex = userCart.find(x => Number(x.id) === Number(it.id));
      if (ex) {
        // Si ya existe el producto, solo aumento la cantidad
        ex.qty = (ex.qty || 1) + (Number(it.qty) || 1);
      } else {
        // Si no existe, lo agrego como nuevo ítem
        userCart.push({
          id: Number(it.id),
          name: String(it.name || "Producto"),
          price: Math.round(Number(it.price || 0)),
          qty: Number(it.qty || 1),
          image: it.image || ""
        });
      }
    }
    // Guardo el carrito migrado y borro el viejo
    localStorage.setItem(key, JSON.stringify(userCart));
    localStorage.removeItem("lc_cart");
  }

  // ---------- navbar ----------
  // Ajusto la navbar según si el usuario está logueado o no
  function hydrateNavbar() {
    const auth = $("#nav-auth-only");
    const prof = $("#nav-profile");
    const nameEl = $("#nav-username");
    const adminLink = $("#nav-admin");

    if (isLoggedIn()) {
      // Oculto botones de login y muestro el perfil
      auth && auth.classList.add("d-none");
      prof && prof.classList.remove("d-none");
      const cl = getClaims();
      if (nameEl) nameEl.textContent = cl?.username || cl?.email || "Mi perfil";
      // Si el usuario es admin, muestro el link de admin
      if (adminLink) {
        if (cl?.is_admin) adminLink.classList.remove("d-none");
        else adminLink.classList.add("d-none");
      }
    } else {
      // Si no está logueado, muestro login y escondo perfil
      auth && auth.classList.remove("d-none");
      prof && prof.classList.add("d-none");
    }
  }

  // ---------- wishlist badge ----------
  // Pido al backend cuántos productos hay en la wishlist para mostrar el badge
  async function fetchWishlistCount() {
    if (!isLoggedIn()) return 0;
    try {
      const r = await fetch(API + "/api/wishlist", {
        headers: { Authorization: "Bearer " + getToken() },
        cache: "no-store",
      });
      if (!r.ok) return 0;
      const d = await r.json();
      return (d.items || []).length || 0;
    } catch { return 0; }
  }

  // ---------- carrito por usuario ----------
  // Leo el carrito que corresponde al usuario actual
  function readCart() {
    const key = cartKey();
    if (!key) return [];
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  }
  // Escribo el carrito para el usuario actual
  function writeCart(items) {
    const key = cartKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(items));
  }

  // ---------- render carrito (offcanvas) + badge ----------
  // Pinto el contenido del carrito en el offcanvas y actualizo el badge del ícono
  function renderCart() {
    const list = $("#cart-list");
    const totalEl = $("#cart-total");
    const cartBadge = $("#cart-count");

    const items = readCart();

    // Cantidad total de productos (sumo cantidades)
    const count = items.reduce((a, i) => a + (i.qty || 1), 0);
    if (cartBadge) cartBadge.textContent = String(isLoggedIn() ? count : 0);

    if (!list) return;

    // Si no hay sesión, muestro mensaje y total cero
    if (!isLoggedIn()) {
      list.innerHTML = `<li class="list-group-item text-center text-muted">Inicia sesión para usar el carrito.</li>`;
      totalEl && (totalEl.textContent = fmtCOP(0));
      return;
    }
    // Si el carrito está vacío
    if (!items.length) {
      list.innerHTML = `<li class="list-group-item text-center text-muted">Tu carrito está vacío</li>`;
      totalEl && (totalEl.textContent = fmtCOP(0));
      return;
    }

    // Aquí armo el HTML de cada línea del carrito
    list.innerHTML = items.map(i => {
      const qty = Number(i.qty || 1);
      const unit = Math.round(Number(i.price || 0));
      const line = unit * qty;
      const img = i.image
        ? `<img src="${i.image}" alt="" class="me-2 rounded" style="width:44px;height:36px;object-fit:cover;">`
        : "";
      return `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            ${img}
            <div>
              <strong>${i.name}</strong>
              <div class="small text-muted">Precio unitario: ${fmtCOP(unit)}</div>
              <div class="d-inline-flex align-items-center gap-1 mt-1">
                <button class="btn btn-sm btn-outline-secondary px-2" data-qty-dec="${i.id}" title="Disminuir">−</button>
                <span class="mx-1">Cant: ${qty}</span>
                <button class="btn btn-sm btn-outline-secondary px-2" data-qty-inc="${i.id}" title="Aumentar">+</button>
              </div>
            </div>
          </div>
          <div class="text-end d-flex flex-column align-items-end gap-2">
            <span class="fw-semibold">${fmtCOP(line)}</span>
            <button class="btn btn-sm btn-outline-danger" data-del="${i.id}" title="Eliminar">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </li>`;
    }).join("");

    // Calculo el total del carrito
    const total = items.reduce((a, i) => a + Math.round(Number(i.price || 0)) * (i.qty || 1), 0);
    totalEl && (totalEl.textContent = fmtCOP(total));
  }

  // Manejo clicks generales sobre los botones del carrito (eliminar, +, -)
  document.addEventListener("click", (ev) => {
    const btnDel = ev.target.closest("[data-del]");
    if (btnDel) {
      const id = Number(btnDel.getAttribute("data-del"));
      let items = readCart();
      items = items.filter(i => Number(i.id) !== id);
      writeCart(items);
      renderCart();
      return;
    }

    const btnInc = ev.target.closest("[data-qty-inc]");
    if (btnInc) {
      const id = Number(btnInc.getAttribute("data-qty-inc"));
      const items = readCart();
      const it = items.find(i => Number(i.id) === id);
      if (it) {
        it.qty = (Number(it.qty) || 1) + 1;
        writeCart(items);
        renderCart();
      }
      return;
    }

    const btnDec = ev.target.closest("[data-qty-dec]");
    if (btnDec) {
      const id = Number(btnDec.getAttribute("data-qty-dec"));
      const items = readCart();
      const it = items.find(i => Number(i.id) === id);
      if (it) {
        const current = Number(it.qty) || 1;
        it.qty = current > 1 ? current - 1 : 1;
        writeCart(items);
        renderCart();
      }
      return;
    }
  });

  // ---------- modal de acceso ----------
  // Abro el modal que obliga a iniciar sesión
  function openAuthModal() {
    const el = document.getElementById("authGateModal");
    if (el && window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(el).show();
    } else {
      alert("Inicia sesión para continuar.");
    }
  }
  // Función de ayuda: si no hay login, abro el modal y devuelvo false
  function requireLogin() {
    if (!isLoggedIn()) {
      openAuthModal();
      return false;
    }
    return true;
  }

  // Exponer helpers en window para que otros scripts puedan usarlos
  window.__vivero = {
    getToken,
    isLoggedIn,
    getClaims,
    cartKey,
    readCart,
    writeCart,
    requireLogin,
    renderCart
  };

  // ---------- logout ----------
  // Botón de salir de la sesión desde la navbar
  const logoutBtn = $("#btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      location.href = "index.html";
    });
  }

  // ---------- init ----------
  // En el arranque trato de migrar carrito viejo, refrescar navbar y pintar carrito
  try { migrateLegacyCart(); } catch {}
  try { hydrateNavbar(); } catch {}
  try { renderCart(); } catch {}

  // Cuando cambia el storage (otra pestaña, etc.), actualizo estado de sesión y carrito
  window.addEventListener("storage", (ev) => {
    if (!ev.key) return;
    if (ev.key === "token" || ev.key.startsWith("lc_cart_") || ev.key === "lc_cart") {
      try { migrateLegacyCart(); } catch {}
      try { hydrateNavbar(); } catch {}
      try { renderCart(); } catch {}
    }
  });

  // Pido la cantidad de la wishlist y actualizo el badge
  fetchWishlistCount().then(n => {
    const wishBadge = document.querySelector("#wish-count");
    if (wishBadge) wishBadge.textContent = String(n);
  });

  // ---------- botón carrito → WhatsApp ----------
  // Armo el texto que voy a mandar por WhatsApp con los datos del carrito
  function buildCartWhatsAppMessage() {
    const items = readCart();
    if (!items.length) {
      return "Hola, quiero hacer un pedido, pero mi carrito está vacío.";
    }

    const lines = [];
    lines.push("Hola, quiero hacer este pedido desde la página del vivero.");
    lines.push("");
    lines.push("Detalle de mi carrito:");

    items.forEach((it) => {
      const name = (it.name || "Producto").trim();
      const qty  = Number(it.qty || 1);
      const unit = Math.round(Number(it.price || 0)); // precio unitario en pesos
      const sub  = unit * qty;                        // total por ítem

      // • Nombre — Cantidad — Precio unitario — Subtotal
      lines.push(
        `• ${name} — cant: ${qty} — ${fmtCOP(unit)} c/u — total: ${fmtCOP(sub)}`
      );
    });

    const total = items.reduce(
      (acc, it) => acc + Math.round(Number(it.price || 0)) * (it.qty || 1),
      0
    );
    lines.push("");
    lines.push(`Total aproximado: ${fmtCOP(total)}`);

    const user = getClaims();
    if (user?.username || user?.email) {
      lines.push("");
      lines.push(`Cliente: ${user.username || user.email}`);
    }

    const now = new Date();
    lines.push("");
    lines.push(
      `Fecha: ${now.toLocaleDateString("es-CO")} ${now.toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit"
      })}`
    );

    return lines.join("\n");
  }

  // Botón que abre WhatsApp con el pedido del carrito
  const cartWaBtn = document.querySelector("#btnCartWhatsApp");
  if (cartWaBtn) {
    cartWaBtn.addEventListener("click", () => {
      // Igual que el carrito normal: exige sesión
      if (!requireLogin()) return;

      const items = readCart();
      if (!items.length) {
        alert("Tu carrito está vacío.");
        return;
      }

      const rawPhone = cartWaBtn.dataset.phone || "+57 321 926 1465";
      // Limpio el número para dejar solo dígitos y el +
      const phone = rawPhone.replace(/[^\d+]/g, "");

      const msg = buildCartWhatsAppMessage();
      const url = `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(msg)}`;

      window.open(url, "_blank");
    });
  }

  // Inicializo AOS si existe. Si no, quito las animaciones para que no se vea raro
  function initAOSSafe() {
    if (window.AOS && typeof AOS.init === "function") {
      AOS.init({ once: true, duration: 700, easing: "ease-out", offset: 40 });
      return;
    }
    document.querySelectorAll("[data-aos]").forEach(el => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }
  document.addEventListener("DOMContentLoaded", initAOSSafe);
})();
