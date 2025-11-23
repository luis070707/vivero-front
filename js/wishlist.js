// js/wishlist.js — Vista de favoritos conectada al backend
(() => {
  // URL base de mi API
  const API = "https://vivero-back.onrender.com";

  // ---------- DOM helpers ----------
  // Atajos para seleccionar elementos
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---------- Formato COP ----------
  // Formateo un número a pesos colombianos sin decimales
  const fmtCOP = (v) =>
    (Number(v) || 0).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  // ---------- sesión/carrito: tomamos todo de app.js si está ----------
  // Aquí intento usar las funciones globales de app.js (window.__vivero)
  const sess = window.__vivero || {};
  // Si existen las funciones, las uso; si no, uso un fallback sencillo
  const getToken   = () => (sess.getToken   ? sess.getToken()   : (localStorage.getItem("token") || sessionStorage.getItem("token") || null));
  const isLoggedIn = () => (sess.isLoggedIn ? sess.isLoggedIn() : !!getToken());
  const getClaims  = () => (sess.getClaims  ? sess.getClaims()  : null);
  const readCart   = () => (sess.readCart   ? sess.readCart()   : (JSON.parse(localStorage.getItem("lc_cart") || "[]")));
  const writeCart  = (arr) => (sess.writeCart ? sess.writeCart(arr) : localStorage.setItem("lc_cart", JSON.stringify(arr)));
  const renderCart = () => (sess.renderCart ? sess.renderCart() : _renderCartFallback());

  // ---------- fetch con auth ----------
  // Helper para llamar la API que requiere autenticación
  async function apiAuth(path, opts = {}) {
    const token = getToken();
    const init = { method: "GET", headers: {}, cache: "no-store", ...opts };
    // Si mando body y no tengo Content-Type, lo marco como JSON
    if (init.body && !init.headers["Content-Type"]) init.headers["Content-Type"] = "application/json";
    // Si hay token, lo agrego al header Authorization
    if (token) init.headers["Authorization"] = "Bearer " + token;
    const res  = await fetch(API + path, init);
    const ct   = res.headers.get("content-type") || "";
    // Si la respuesta es JSON, la parseo; si no, me quedo con texto
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || res.statusText);
    return data;
  }

  // ---------- Navbar (igual que el resto del sitio) ----------
// Aquí reaprovecho la misma lógica de app.js para mostrar/ocultar
// el login y el menú de perfil. Además, solo oculto el item
// "Mis favoritos" dentro del dropdown cuando ya estoy en wishlist.
function hydrateWishlistNavbar() {
  const auth = $("#nav-auth-only");
  const prof = $("#nav-profile");
  const nameEl = $("#nav-username");
  const adminLink = $("#nav-admin");

  if (isLoggedIn()) {
    // Oculto botones de login y muestro el perfil
    auth && auth.classList.add("d-none");
    prof && prof.classList.remove("d-none");

    const cl = getClaims();
    if (nameEl) {
      nameEl.textContent = cl?.username || cl?.email || "Mi perfil";
    }

    // Si el usuario es admin, muestro/oculto el link de admin
    if (adminLink) {
      if (cl?.is_admin) {
        adminLink.classList.remove("d-none");
      } else {
        adminLink.classList.add("d-none");
      }
    }
  } else {
    // Si no hay sesión, muestro login y oculto perfil
    auth && auth.classList.remove("d-none");
    prof && prof.classList.add("d-none");
    if (adminLink) adminLink.classList.add("d-none");
  }

  // Extra: en la propia página de favoritos, oculto SOLO el item
  // "Mis favoritos" del menú desplegable, para no tener un link que
  // recarga la misma página.
  const wishLink = document.querySelector('a[href="wishlist.html"]');
  const wishLi = wishLink?.closest("li");
  if (wishLi && wishLi.parentElement?.classList.contains("dropdown-menu")) {
    wishLi.classList.add("d-none");
  }
}


  // ---------- Badges ----------
  // Actualizo el numerito del carrito
  function setCartBadge() {
    const items = readCart();
    const count = isLoggedIn() ? items.reduce((a,i)=>a + (i.qty || 1), 0) : 0;
    const b = $("#cart-count");
    if (b) b.textContent = String(count);
  }
  // Actualizo el numerito de la wishlist
  async function setWishBadge() {
    if (!isLoggedIn()) { const b = $("#wish-count"); if (b) b.textContent = "0"; return; }
    try {
      const data = await apiAuth("/api/wishlist");
      const n = Array.isArray(data.items) ? data.items.length : 0;
      const b = $("#wish-count"); if (b) b.textContent = String(n);
      const t = $("#wish-total"); if (t) t.textContent = String(n);
    } catch {
      const b = $("#wish-count"); if (b) b.textContent = "0";
      const t = $("#wish-total"); if (t) t.textContent = "0";
    }
  }

  // Muestra un toast sencillo usando un selector
  function showToast(sel) {
    const el = $(sel); if (!el) return;
    bootstrap.Toast.getOrCreateInstance(el, { delay: 1600 }).show();
  }

  // ---------- Util ----------
  // Saco la primera imagen de un producto (o una por defecto)
  function firstImage(p) {
    try {
      const images = p.images ?? p.product?.images;
      if (Array.isArray(images)) return images[0] || "images/monstera.jpg";
      if (typeof images === "string") {
        const arr = JSON.parse(images);
        return arr[0] || "images/monstera.jpg";
      }
    } catch {}
    return "images/monstera.jpg";
  }

  // Normaliza item del backend a un objeto de producto usuario-friendly
  function toProduct(item) {
    const src = item.product ? item.product : item;
    const id   = Number(src.id ?? item.product_id);
    return {
      id,
      name: src.name,
      category_name: src.category_name,
      // Aquí trato el precio como pesos (por compatibilidad)
      price_cents: Number(src.price_cents || src.price || 0), // en pesos
      stock: Number(src.stock || 0),
      img: firstImage(src),
    };
  }

  // ---------- Carrito ----------
  // Añadir un producto de wishlist al carrito
  function addToCart(prod) {
    // Aseguro que el precio esté en pesos enteros
    const pricePesos = Math.round(Number(prod.price_cents ?? prod.price ?? 0));
    const items = readCart();
    const ex = items.find(i => Number(i.id) === Number(prod.id));
    if (ex) ex.qty += 1;
    else items.push({ id: Number(prod.id), name: String(prod.name), price: pricePesos, qty: 1 });
    writeCart(items);
    renderCart();
    setCartBadge();
    showToast("#toast-added");
  }
  // Quitar un producto del carrito (lo uso en el fallback)
  function removeFromCart(id) {
    const items = readCart().filter(i => String(i.id) !== String(id));
    writeCart(items);
    renderCart();
    setCartBadge();
  }

  // ---------- Render ----------
  // Muestro u oculto el mensaje de wishlist vacía
  function renderEmpty(show) {
    const empty = $("#wishEmpty");
    if (!empty) return;
    empty.classList.toggle("d-none", !show);
  }

  // Pinto toda la lista de productos en forma de cards
  function renderGrid(list) {
    const grid = $("#wishGrid"); if (!grid) return;
    grid.innerHTML = list.map(p => `
      <div class="col-12 col-sm-6 col-md-4 col-xl-3">
        <div class="card wish-card h-100 shadow-sm">
          <img src="${p.img}" alt="${p.name}" onerror="this.src='images/monstera.jpg'; this.onerror=null;">
          <div class="card-body d-flex flex-column">
            <h6 class="card-title mb-1">${p.name}</h6>
            <p class="text-muted small mb-2">${p.category_name || ""}</p>
            <div class="d-flex align-items-center gap-2 mb-3">
              <span class="text-success fw-bold">${fmtCOP(p.price_cents)}</span>
              ${
                p.stock > 10
                ? '<span class="badge bg-success">En stock</span>'
                : p.stock > 0
                  ? '<span class="badge bg-warning text-dark">Pocas unidades</span>'
                  : '<span class="badge bg-secondary">Sin stock</span>'
              }
            </div>
            <div class="mt-auto d-grid gap-2">
              <button class="btn btn-custom btn-sm" data-addcart="${p.id}" ${p.stock<=0?'disabled':''}>
                <i class="bi bi-cart-plus"></i> Añadir al carrito
              </button>
              <button class="btn btn-outline-danger btn-sm" data-remove-w="${p.id}">
                <i class="bi bi-trash"></i> Quitar
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join("");
  }

  // Cargar wishlist desde el backend y pintarla
  async function loadWishlist() {
    if (!isLoggedIn()) {
      // Si no hay login, muestro aviso y la lista vacía
      $("#needLogin")?.classList.remove("d-none");
      renderGrid([]);
      renderEmpty(true);
      $("#wish-total") && ($("#wish-total").textContent = "0");
      setWishBadge();
      return;
    }
    $("#needLogin")?.classList.add("d-none");

    try {
      const data = await apiAuth("/api/wishlist");
      const items = Array.isArray(data.items) ? data.items : [];
      const list  = items.map(toProduct);

      $("#wish-total") && ($("#wish-total").textContent = String(list.length));
      renderGrid(list);
      renderEmpty(list.length === 0);

      // Actualizo el badge del corazón si existe
      const b = $("#wish-count"); if (b) b.textContent = String(items.length);
    } catch {
      // Si falla la carga, dejo todo vacío
      renderGrid([]);
      renderEmpty(true);
      $("#wish-total") && ($("#wish-total").textContent = "0");
    }
  }

  // ---------- Eventos ----------
  document.addEventListener("DOMContentLoaded", () => {
    // Ajusto navbar y badges al entrar a la página
    try { hydrateWishlistNavbar(); } catch {}
    try { setCartBadge(); } catch {}
    try { renderCart(); } catch {}
    try { setWishBadge(); } catch {}
    // Cargo la lista de favoritos
    loadWishlist();

    // Botón para vaciar toda la wishlist
    $("#btnClearWish")?.addEventListener("click", async () => {
      if (!isLoggedIn()) return;
      try {
        const data = await apiAuth("/api/wishlist");
        const items = Array.isArray(data.items) ? data.items : [];
        // Borro uno por uno desde el backend
        for (const it of items) {
          const pid = Number(it.product_id ?? it.id ?? it.product?.id);
          if (!Number.isNaN(pid)) {
            try { await apiAuth(`/api/wishlist/${pid}`, { method: "DELETE" }); } catch {}
          }
        }
      } finally {
        await loadWishlist();
      }
    });

    // Delegación de clicks para toda la página
    document.body.addEventListener("click", async (e) => {
      const add = e.target.closest("[data-addcart]");
      if (add) {
        const id = Number(add.getAttribute("data-addcart"));
        try {
          // Releo la wishlist del backend para asegurarme de tener precio/stock actualizados
          const data = await apiAuth("/api/wishlist");
          const it = (data.items || []).find(x => Number(x.product_id ?? x.id ?? x.product?.id) === id);
          if (it) {
            const p = toProduct(it);
            if (p.stock > 0) addToCart(p);
          }
        } catch {
          // Si falla la red, al menos agrego algo básico al carrito
          addToCart({ id, name: "Producto", price_cents: 0 });
        }
        return;
      }

      const rem = e.target.closest("[data-remove-w]");
      if (rem) {
        const id = Number(rem.getAttribute("data-remove-w"));
        if (!Number.isNaN(id) && isLoggedIn()) {
          try { await apiAuth(`/api/wishlist/${id}`, { method: "DELETE" }); }
          finally { await loadWishlist(); }
        }
        return;
      }

      const del = e.target.closest("[data-remove]"); // borrar del carrito (offcanvas) en caso de fallback
      if (del) {
        removeFromCart(del.getAttribute("data-remove"));
        return;
      }
    });

    // Sync entre pestañas: si cambia token o carrito, actualizo todo visualmente
    window.addEventListener("storage", (ev) => {
      if (!ev.key) return;
      if (ev.key === "token" || ev.key.startsWith("lc_cart_")) {
        try { hydrateWishlistNavbar(); } catch {}
        try { setCartBadge(); } catch {}
        try { renderCart(); } catch {}
        try { setWishBadge(); } catch {}
      }
    });
  });

  // ---------- Fallback render carrito (si no existe el de app.js) ----------
  // En caso de que no tenga las funciones de carrito global, uso esta versión simplificada
  function _renderCartFallback() {
    const items = readCart();
    const badge = $("#cart-count"); if (badge) badge.textContent = String(items.reduce((a,i)=>a+i.qty,0));
    const listEl = $("#cart-list");
    if (listEl) {
      listEl.innerHTML = items.length
        ? items.map(i => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
              <div>
                <strong>${i.name}</strong>
                <div class="small text-muted">Cant: ${i.qty}</div>
              </div>
              <div class="d-flex align-items-center gap-2">
                <span>${fmtCOP(i.price * i.qty)}</span>
                <button class="btn btn-sm btn-outline-danger" data-remove="${i.id}">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </li>
          `).join("")
        : `<li class="list-group-item text-center text-muted">Tu carrito está vacío</li>`;
    }
    const totalEl = $("#cart-total");
    if (totalEl) {
      totalEl.textContent = fmtCOP(items.reduce((a,i)=>a + (i.price * i.qty), 0));
    }
  }
})();
