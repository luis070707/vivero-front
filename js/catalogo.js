// js/catalogo.js — Catálogo + Wishlist + Carrito + Quick View
(() => {
  // URL base de la API
  const API = "https://vivero-back.onrender.com";

  // Atajos para seleccionar elementos
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ===== Sesión / carrito (expuestos por app.js) =====
  // Aquí uso los helpers que expuse en window.__vivero, pero si no existen uso un fallback
  const app = window.__vivero || {};
  const getToken     = () => (app.getToken ? app.getToken() : (localStorage.getItem("token") || sessionStorage.getItem("token") || null));
  const isLoggedIn   = () => (app.isLoggedIn ? app.isLoggedIn() : !!getToken());
  const requireLogin = () => (app.requireLogin ? app.requireLogin() : (isLoggedIn() || (alert("Inicia sesión para continuar."), false)));
  const readCart     = () => (app.readCart ? app.readCart() : JSON.parse(localStorage.getItem("cart") || "[]"));
  const writeCart    = (arr) => (app.writeCart ? app.writeCart(arr) : localStorage.setItem("cart", JSON.stringify(arr)));
  const renderCart   = () => (app.renderCart ? app.renderCart() : null);

  // ===== Utils =====
  // Formateo a pesos colombianos
  const fmtCOP = (n) => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });
  // Pequeño escape para texto en HTML
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch => ch==="&"?"&amp;":ch==="<"?"&lt;":ch===">"?"&gt;":ch==='"'?"&quot;":"&#39;");
  // Saco solo dígitos de un texto y lo convierto a número
  const onlyDigits = (s) => parseInt(String(s||"").replace(/[^\d]/g, ""), 10) || 0;

  // Aquí decido qué imagen mostrar de un producto
  function resolveImg(p) {
    if (p.image_url) return `${p.image_url}?v=${p.id}`;
    try {
      if (Array.isArray(p.images) && p.images.length) return p.images[0];
      if (typeof p.images === "string") {
        const arr = JSON.parse(p.images);
        if (Array.isArray(arr) && arr.length) return arr[0];
      }
    } catch {}
    // Imagen por defecto
    return "images/monstera.jpg";
  }

  // Petición sin auth al backend
  async function req(path) {
    const r = await fetch(API + path, { cache: "no-store" });
    const ct = r.headers.get("content-type") || "";
    const d = ct.includes("application/json") ? await r.json() : await r.text();
    if (!r.ok) throw new Error((d && d.error) || r.statusText || "Error");
    return d;
  }

  // Petición con auth (JWT) al backend
  async function reqAuth(path, init = {}) {
    const r = await fetch(API + path, {
      cache: "no-store",
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: "Bearer " + getToken(),
        ...(init.headers || {})
      }
    });
    const ct = r.headers.get("content-type") || "";
    const d = ct.includes("application/json") ? await r.json() : await r.text();
    if (!r.ok) throw new Error((d && d.error) || r.statusText || "Error");
    return d;
  }

  // Actualizo el badge del carrito en la navbar
  function bumpCartBadge() {
    const items = readCart();
    const totalQty = items.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
    const badge = $("#cart-count");
    if (badge) badge.textContent = String(isLoggedIn() ? totalQty : 0);
  }

  // === TOAST (usa #toast-added del HTML) ===
  // Muestra un toast cuando agrego algo al carrito
  function toastAdded(msg="Producto añadido al carrito. 💚") {
    const t = $("#toast-added");
    if (t && window.bootstrap) {
      const inst = bootstrap.Toast.getOrCreateInstance(t, { delay: 1400 });
      const body = t.querySelector(".toast-body");
      if (body) body.textContent = msg;
      inst.show();
    }
  }

  // =====>> AQUÍ se arregla el comportamiento de login en carrito <<=====
  // Esta función se encarga de añadir productos al carrito
  function addToCart({ id, name, price, qty = 1, image = "" }) {
    // Si no hay sesión, abro modal y no hago nada más
    if (!requireLogin()) return false;

    const items = readCart();
    const i = items.find(x => Number(x.id) === Number(id));
    if (i) {
      // Si ya existe, solo sumo la cantidad
      i.qty += Number(qty || 1);
    } else {
      // Si no existe, lo agrego
      items.push({
        id: Number(id),
        name: String(name || "Producto"),
        price: Math.round(Number(price || 0)), // PESOS
        qty: Number(qty || 1),
        image
      });
    }
    writeCart(items);
    renderCart && renderCart();
    bumpCartBadge();
    toastAdded();
    return true;
  }

  // Refresco el número de la wishlist que se ve en el badge de la navbar
  async function refreshWishBadge() {
    try {
      const el = $("#wish-count");
      if (!el) return;
      if (!isLoggedIn()) { el.textContent = "0"; return; }
      const d = await reqAuth("/api/wishlist", { method: "GET" });
      el.textContent = String((d.items || []).length || 0);
    } catch {}
  }

  // ===== Estado =====
  // Aquí guardo el estado de filtros y vista del catálogo
  const state = {
    q: "",
    category: "",
    sort: "recent",
    page: 1,
    pageSize: 48,
    priceMin: null,
    priceMax: null,
    view: "grid"   // "grid" | "list"
  };

  // ===== Categorías =====
  // Cargo las categorías desde la API y las pinto en los filtros
  async function loadCategories() {
    try {
      const wrapD = $("#categoryFilters"), wrapM = $("#categoryFiltersMobile");
      if (!wrapD && !wrapM) return;
      const res = await req("/api/categories");
      const categories = res.categories || res.items || [];
      const html = categories.map(c => `
        <label class="filter-check d-flex align-items-center">
          <input type="checkbox" value="${esc(c.slug)}" data-filter-cat data-name="${esc(c.name)}">
          <span>${esc(c.name)}</span>
        </label>`).join("");
      if (wrapD) wrapD.innerHTML = html;
      if (wrapM) wrapM.innerHTML = html;

      // Solo dejo una categoría activa a la vez (comportamiento tipo radio)
      document.body.addEventListener("change", (ev) => {
        const cb = ev.target.closest('input[data-filter-cat]');
        if (!cb) return;
        $$('#categoryFilters input[type="checkbox"], #categoryFiltersMobile input[type="checkbox"]').forEach(i => {
          i.checked = i === cb && cb.checked;
        });
        state.category = cb.checked ? cb.value : "";
        state.page = 1;
        loadProducts();
      });
    } catch (e) {
      console.error("[catalog] loadCategories:", e);
    }
  }

  // ===== Render catálogo =====
  const grid = $("#productGrid");
  const rc = $("#resultCount");
  const pagerPrev = $("#pagerPrev");
  const pagerNext = $("#pagerNext");
  const pagerNum  = $("#pagerNum");

  // Tomo el precio de un producto sin preocuparme si viene en price_cents o price
  function getPrice(p) {
    return Number(p.price_cents ?? p.price ?? 0);
  }

  // Genero el HTML de una tarjeta de producto
  function productCard(p) {
    const img = resolveImg(p);
    const stock = p.stock > 10 ? `<span class="badge bg-success stock">En stock</span>`
              : p.stock > 0  ? `<span class="badge bg-warning text-dark stock">Pocas unidades</span>`
              : `<span class="badge bg-secondary stock">Sin stock</span>`;
    const dis = p.stock <= 0 ? "disabled" : "";
    const colClass = (state.view === "list")
      ? "col-12"
      : "col col-12 col-sm-6 col-md-4 col-xl-3";

    return `
      <div class="${colClass}">
        <div class="card product-card h-100 shadow-sm">
          <div class="position-relative">
            <img src="${img}" alt="${esc(p.name)}" class="card-img-top"
                 onerror="this.src='images/monstera.jpg';this.onerror=null;">
            <button class="btn-wish" aria-label="Favorito" data-wish data-id="${p.id}">
              <i class="bi bi-heart"></i>
            </button>
            ${stock}
          </div>
          <div class="card-body d-flex flex-column">
            <h6 class="card-title mb-1">${esc(p.name)}</h6>
            <p class="text-muted small mb-2">${esc(p.category_name || "")}</p>
            <div class="d-flex align-items-center gap-2 mb-3">
              <span class="text-success fw-bold" data-price="${p.price_cents ?? p.price}">${fmtCOP(p.price_cents ?? p.price)}</span>
            </div>
            <div class="mt-auto d-grid gap-2">
              <button class="btn btn-custom btn-sm" data-add data-id="${p.id}" ${dis}>
                <i class="bi bi-cart"></i> Añadir
              </button>
              <button class="btn btn-outline-secondary btn-sm" data-qv data-id="${p.id}">
                Vista rápida
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // Aquí cargo los productos del backend, aplico filtros y pinto el grid
  async function loadProducts() {
    if (!grid) return;
    try {
      grid.innerHTML = `<div class="col-12 text-center text-muted py-4">Cargando…</div>`;
      const params = new URLSearchParams({
        q: state.q,
        category: state.category,
        sort: state.sort,
        page: String(state.page),
        pageSize: String(state.pageSize),
        t: String(Date.now())
      });
      const data = await req(`/api/products?${params.toString()}`);
      const rawItems = data.items || [];

      // Filtro por precio en el front (si hay min/max)
      let items = rawItems.slice();
      const min = state.priceMin != null ? state.priceMin : null;
      const max = state.priceMax != null ? state.priceMax : null;

      if (min != null || max != null) {
        items = items.filter(p => {
          const price = getPrice(p);
          if (min != null && price < min) return false;
          if (max != null && price > max) return false;
          return true;
        });
      }

      // Ordeno en el front según el tipo que tenga en state.sort
      switch (state.sort) {
        case "price-asc":
          items.sort((a, b) => getPrice(a) - getPrice(b));
          break;
        case "price-desc":
          items.sort((a, b) => getPrice(b) - getPrice(a));
          break;
        case "name-asc":
          items.sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" })
          );
          break;
        case "name-desc":
          items.sort((a, b) =>
            String(b.name || "").localeCompare(String(a.name || ""), "es", { sensitivity: "base" })
          );
          break;
        // "recent" => dejo el orden que viene del backend
      }

      const totalFiltered = items.length;
      rc && (rc.textContent = String(totalFiltered));

      grid.innerHTML = items.map(productCard).join("");

      // Calculo cantidad de páginas para el paginador
      const pages = Math.max(1, Math.ceil(totalFiltered / state.pageSize));
      pagerPrev?.toggleAttribute("disabled", state.page <= 1);
      pagerNext?.toggleAttribute("disabled", state.page >= pages);
      pagerNum && (pagerNum.textContent = `${state.page}/${pages}`);

      await markWishlistHearts();
      bumpCartBadge();
    } catch (e) {
      console.error("[catalog] loadProducts:", e);
      grid.innerHTML = `<div class="col-12 text-center text-danger py-4">No se pudo cargar el catálogo.</div>`;
    }
  }

  // ===== Wishlist =====
  // Marco los corazones de los productos que ya están en la wishlist
  async function markWishlistHearts() {
    if (!isLoggedIn()) return;
    try {
      const d = await reqAuth("/api/wishlist", { method: "GET" });
      const ids = new Set((d.items || []).map(x => Number(x.id ?? x.product_id)));
      $$('[data-wish][data-id]').forEach(btn => {
        const id = Number(btn.getAttribute("data-id"));
        const icon = btn.querySelector("i");
        if (!icon) return;
        if (ids.has(id)) {
          icon.classList.remove("bi-heart");
          icon.classList.add("bi-heart-fill");
        } else {
          icon.classList.add("bi-heart");
          icon.classList.remove("bi-heart-fill");
        }
      });
    } catch (e) {
      console.warn("[catalog] markWishlistHearts:", e.message);
    }
  }

  // ===== QUICK VIEW =====
  // Referencias del modal de Vista Rápida
  function getQVRefs() {
    const root = document.getElementById("quickView");
    if (!root) return null;
    return {
      root,
      img:  root.querySelector("#qvImage"),
      name: root.querySelector("#qvName"),
      cat:  root.querySelector("#qvCategory"),
      price:root.querySelector("#qvPrice"),
      desc: root.querySelector("#qvDesc"),
      qty:  root.querySelector("#qvQty"),
      add:  root.querySelector("#qvAdd"),
      totalHolder: root.querySelector('[data-qv-total="1"]'),
      modal: bootstrap.Modal.getOrCreateInstance(root)
    };
  }

  // Aquí dejo en memoria los datos actuales del producto en quick view
  let qvData = null; // {id, name, category, image, price, description}

  // Pinto los datos en el modal de Vista Rápida
  function paintQV(refs) {
    if (!refs || !qvData) return;
    refs.img && (refs.img.src = qvData.image || "images/monstera.jpg");
    refs.name && (refs.name.textContent = qvData.name || "Producto");
    refs.cat && (refs.cat.textContent = qvData.category || "");
    refs.desc && (refs.desc.textContent = qvData.description || "Sin descripción.");
    refs.price && (refs.price.textContent = fmtCOP(qvData.price || 0));
    if (refs.qty) refs.qty.value = "1";
    updateQVTotal(refs);
  }

  // Actualizo la línea de total dentro del quick view según la cantidad
  function updateQVTotal(refs) {
    if (!refs?.qty) return;
    const qty = Math.max(1, parseInt(refs.qty.value || "1", 10));
    const total = (qvData?.price || 0) * qty;
    if (!refs.totalHolder) {
      const t = document.createElement("div");
      t.className = "small mt-1";
      t.dataset.qvTotal = "1";
      t.innerHTML = `Total: <strong class="text-success">${fmtCOP(total)}</strong>`;
      refs.price?.insertAdjacentElement("afterend", t);
      refs.totalHolder = t;
    } else {
      refs.totalHolder.innerHTML = `Total: <strong class="text-success">${fmtCOP(total)}</strong>`;
    }
  }

  // Abro el modal de quick view. Primero pinto con datos de la card y luego actualizo con datos completos de la API
  async function openQV(id, seed) {
    const refs = getQVRefs();
    if (!refs) {
      alert("No se encontró el modal de Vista Rápida (#quickView).");
      return;
    }

    // 1) Pinto rápido con lo que ya tengo en la tarjeta
    qvData = {
      id,
      name: seed.name || "Producto",
      category: seed.category || "",
      image: seed.image || "images/monstera.jpg",
      price: Number(seed.price || 0), // PESOS
      description: "Descripción de la planta..."
    };
    paintQV(refs);
    refs.modal.show();

    // 2) Eventos del modal (cambio de cantidad y botón de añadir)
    refs.root.oninput = (ev) => {
      if (ev.target === refs.qty) updateQVTotal(refs);
    };

    refs.root.onclick = (ev) => {
      if (ev.target.closest("#qvAdd")) {
        const qty = Math.max(1, parseInt(refs.qty?.value || "1", 10));
        const ok = addToCart({
          id: qvData.id,
          name: qvData.name,
          price: qvData.price,
          qty,
          image: qvData.image
        });
        // Solo cierro la vista rápida si realmente se añadió
        if (ok) refs.modal.hide();
      }
    };

    // 3) Pido los datos más completos del producto al backend
    try {
      const d = await req(`/api/products/${id}`);
      const p = d.product || d;
      if (p && p.id) {
        qvData.name = p.name || qvData.name;
        qvData.category = p.category_name || qvData.category;
        qvData.price = Number(p.price_cents ?? p.price ?? qvData.price);
        qvData.description = (p.description && String(p.description).trim()) || qvData.description;
        qvData.image = resolveImg(p) || qvData.image;
        paintQV(refs);
      }
    } catch {
      // si falla, me quedo con la info básica que ya tenía
    }
  }

  // ===== Eventos globales =====
  // Manejo clicks globales para wishlist, añadir al carrito y abrir quick view
  document.body.addEventListener("click", async (ev) => {
    // wishlist (pide login)
    const wish = ev.target.closest("[data-wish]");
    if (wish) {
      if (!requireLogin()) return;
      const id   = Number(wish.getAttribute("data-id"));
      const icon = wish.querySelector("i");
      try {
        const d = await reqAuth("/api/wishlist", { method: "GET" });
        const exists = (d.items || []).some(x => Number(x.id ?? x.product_id) === id);
        if (exists) {
          await reqAuth(`/api/wishlist/${id}`, { method: "DELETE" });
          icon && (icon.classList.add("bi-heart"), icon.classList.remove("bi-heart-fill"));
        } else {
          await reqAuth(`/api/wishlist/${id}`, { method: "POST" });
          icon && (icon.classList.remove("bi-heart"), icon.classList.add("bi-heart-fill"));
        }
      } catch (e) {
        console.error("[catalog] wishlist toggle:", e);
      } finally {
        refreshWishBadge();
      }
      return;
    }

    // añadir al carrito desde card
    const add = ev.target.closest("[data-add]");
    if (add) {
      const id = Number(add.getAttribute("data-id"));
      const card = add.closest(".card");
      const name = card?.querySelector(".card-title")?.textContent?.trim() || ("Producto " + id);
      const price = Number(card?.querySelector("[data-price]")?.getAttribute("data-price")) || onlyDigits(card?.querySelector(".text-success")?.textContent);
      const img = card?.querySelector(".card-img-top")?.getAttribute("src") || "images/monstera.jpg";
      addToCart({ id, name, price, qty: 1, image: img });
      return;
    }

    // abrir Quick View
    const btnQV = ev.target.closest("[data-qv]");
    if (btnQV) {
      const id = Number(btnQV.getAttribute("data-id"));
      const card = btnQV.closest(".card");
      const seed = {
        name: card?.querySelector(".card-title")?.textContent?.trim(),
        category: card?.querySelector(".text-muted")?.textContent?.trim(),
        price: Number(card?.querySelector("[data-price]")?.getAttribute("data-price")) || onlyDigits(card?.querySelector(".text-success")?.textContent),
        image: card?.querySelector(".card-img-top")?.getAttribute("src") || "images/monstera.jpg",
      };
      openQV(id, seed);
      return;
    }
  });

  // ===== Búsqueda / orden / paginación / vista / precio =====
  // Búsqueda al presionar Enter
  $("#searchInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      state.q = e.currentTarget.value.trim();
      state.page = 1;
      loadProducts();
    }
  });

  // Cambio de orden
  $("#sortSelect")?.addEventListener("change", (e) => {
    const v = e.currentTarget.value;
    state.sort = (v === "relevance" ? "recent" : v);
    state.page = 1;
    loadProducts();
  });

  // Botones para cambiar entre vista grid y lista
  const btnGrid = $("#btnGrid");
  const btnList = $("#btnList");
  btnGrid?.addEventListener("click", () => {
    if (state.view === "grid") return;
    state.view = "grid";
    btnGrid.classList.add("active");
    btnList?.classList.remove("active");
    loadProducts();
  });
  btnList?.addEventListener("click", () => {
    if (state.view === "list") return;
    state.view = "list";
    btnList.classList.add("active");
    btnGrid?.classList.remove("active");
    loadProducts();
  });

  // Aplicar filtro de precio mínimo y máximo
  $("#applyPrice")?.addEventListener("click", () => {
    const minInput = $("#priceMin");
    const maxInput = $("#priceMax");
    const min = minInput && minInput.value !== "" ? Number(minInput.value) : null;
    const max = maxInput && maxInput.value !== "" ? Number(maxInput.value) : null;
    state.priceMin = isFinite(min) ? min : null;
    state.priceMax = isFinite(max) ? max : null;
    state.page = 1;
    loadProducts();
  });

  // Botón para limpiar todos los filtros
  $("#clearAll")?.addEventListener("click", () => {
    state.q = "";
    state.category = "";
    state.sort = "recent";
    state.priceMin = null;
    state.priceMax = null;
    state.page = 1;

    const search = $("#searchInput");
    if (search) search.value = "";

    $$('input[data-filter-cat]').forEach(cb => { cb.checked = false; });

    const minInput = $("#priceMin");
    const maxInput = $("#priceMax");
    if (minInput) minInput.value = "";
    if (maxInput) maxInput.value = "";

    const sortSel = $("#sortSelect");
    if (sortSel) sortSel.value = "relevance";

    loadProducts();
  });

  // Paginador siguiente/anterior
  pagerPrev?.addEventListener("click", () => {
    if (state.page > 1) {
      state.page--;
      loadProducts();
    }
  });
  pagerNext?.addEventListener("click", () => {
    state.page++;
    loadProducts();
  });

  // ===== init =====
  // Al iniciar, cargo categorías, productos, wishlist y sincronizo carrito
  (async function init() {
    try { await loadCategories(); } catch {}
    await loadProducts();
    await refreshWishBadge();
    bumpCartBadge();
    renderCart && renderCart();
  })();
})();
