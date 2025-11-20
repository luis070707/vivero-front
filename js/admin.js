// js/admin.js
(() => {
  // URL base del backend
  const API = "https://vivero-back.onrender.com";


  // ==================== helpers básicos ====================
  // Atajos para seleccionar elementos
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Me aseguro de instanciar el Toast con el elemento (no con el selector)
  const toastEl = $("#toast");
  const toast = toastEl ? bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 1500 }) : null;
  // Función rápida para mostrar mensajes al admin
  const showMsg = (msg) => {
    if (!toast) return alert(msg);
    $("#toast .toast-body").textContent = msg;
    toast.show();
  };

  // *** Importante sobre dinero ***
  // - En este panel de admin, el input de precio es en PESOS (el número tal cual se ve).
  // - Si escribo 12000, eso es lo que guardo y también lo que muestro.
  // - Sigo llamando el campo "price_cents" por compatibilidad con la API,
  //   pero lo uso como "pesos", así catálogo y admin coinciden.
  const fmtCOP = (pesos) =>
    Number(pesos || 0).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    });

  // Convierto lo que escribo a número entero en pesos (quito separadores como puntos)
  function parsePesos(v) {
    // Si alguien pega "12.000" lo convierto a "12000"
    const limpio = String(v ?? "").replace(/\./g, "").replace(/,/g, ".").trim();
    const n = Number.parseFloat(limpio);
    return Number.isFinite(n) ? Math.round(n) : 0; // me quedo con un entero
  }

  // ==================== auth y guard de admin ====================
  // Saco el token ya sea desde window.__vivero o desde storage
  const token =
    (window.__vivero && typeof window.__vivero.getToken === "function" && window.__vivero.getToken()) ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    null;

  // Headers con auth para las peticiones
  function authHeaders() {
    return token ? { Authorization: "Bearer " + token } : {};
  }

  // Helper general para llamar la API del admin
  async function api(path, init = {}) {
    const isFormData = init.body && typeof FormData !== "undefined" && init.body instanceof FormData;
    const res = await fetch(API + path, {
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...authHeaders(),
        ...init.headers,
      },
      cache: "no-store",
    });
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || res.statusText || "Error de servidor");
    return data;
  }

  // Decodifico el JWT para leer los claims
  function decodeJWT(t) {
    try {
      const p = t.split(".")[1];
      const json = atob(p.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json);
    } catch { return null; }
  }
  // Aquí reviso si el claim indica que el usuario es admin
  function isAdminClaim(c) {
    return !!(c && (c.is_admin === true || c.role === "ADMIN" || c.role === "admin"));
  }
  // Saco un nombre "bonito" para mostrar en la navbar del admin
  function prettyName(c){
    if (c?.full_name) return c.full_name;
    if (c?.username)  return c.username;
    if (c?.email)     return c.email.split("@")[0];
    return "Administrador";
  }

  const guardEl     = $("#guard");
  const summary     = $("#summary");
  const navProfile  = $("#nav-profile");
  const navUsername = $("#nav-username");

  const claims  = token ? decodeJWT(token) : null;
  const isAdmin = isAdminClaim(claims);

  // Si no es admin, muestro el aviso de guard y no dejo ver el panel
  if (!token || !isAdmin) {
    if (summary) summary.classList.add("d-none");
    if (guardEl) guardEl.classList.remove("d-none");
  } else {
    if (summary) summary.classList.remove("d-none");
    if (navProfile) navProfile.classList.remove("d-none");
    if (navUsername) navUsername.textContent = prettyName(claims);
  }

  // Botón de logout en el panel admin
  $("#btn-logout")?.addEventListener("click", () => {
    if (window.__vivero?.logout) window.__vivero.logout();
    else { localStorage.removeItem("token"); sessionStorage.removeItem("token"); }
    location.href = "index.html";
  });

  // Si no es admin, corto aquí y no sigo cargando nada
  if (!token || !isAdmin) return;

  // ==================== summary ====================
  // Cargo un pequeño resumen de conteos para el dashboard
  async function loadSummary() {
    try {
      const s = await api("/api/admin/summary");
      $("#sum-users").textContent      = s.users ?? 0;
      $("#sum-products").textContent   = s.products ?? 0;
      $("#sum-categories").textContent = s.categories ?? 0;
    } catch { /* no rompo la UI si falla */ }
  }

  // ==================== categorías ====================
  const catBody   = $("#catBody");
  const catModal  = new bootstrap.Modal("#catModal");
  const catForm   = $("#catForm");
  const catId     = $("#catId");
  const catName   = $("#catName");
  const catSlug   = $("#catSlug");

  // Aquí almaceno en memoria las categorías para pintarlas, filtrarlas, etc.
  let CATS = [];

  // Escape simple para escribir HTML seguro
  function esc(s){
    return String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // Pido las categorías de admin y lleno la tabla y los select
  async function loadCategories() {
    if (catBody) catBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Cargando…</td></tr>`;
    try {
      const res = await api("/api/admin/categories");
      CATS = res.items || [];
      renderCatTable();
      populateCatFilter();
      populateCatSelect();
    } catch (e) {
      if (catBody) catBody.innerHTML = `<tr><td colspan="4" class="text-danger">Error: ${esc(e.message)}</td></tr>`;
    }
  }

  // Pinto la tabla de categorías en el panel
  function renderCatTable() {
    if (!catBody) return;
    if (!CATS.length) {
      catBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Sin categorías</td></tr>`;
      return;
    }
    catBody.innerHTML = CATS.map(c => `
      <tr>
        <td>${c.id}</td>
        <td>${esc(c.name)}</td>
        <td><span class="badge text-bg-light">${esc(c.slug)}</span></td>
        <td>
          <button class="btn btn-outline-secondary btn-sm me-1" data-edit-cat="${c.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm" data-del-cat="${c.id}"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join("");
  }

  // Botón para crear nueva categoría
  $("#btnNewCat")?.addEventListener("click", () => {
    $("#catModalTitle").textContent = "Nueva categoría";
    catId.value = ""; catName.value = ""; catSlug.value = "";
    catModal.show();
  });

  // Guardar categoría (crear o editar)
  catForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id   = catId.value ? Number(catId.value) : null;
    const name = String(catName.value || "").trim();
    const slug = String(catSlug.value || "").trim() || null;
    if (!name) return showMsg("El nombre es obligatorio");
    try {
      if (id) await api(`/api/admin/categories/${id}`, { method: "PUT",  body: JSON.stringify({ name, slug }) });
      else    await api(`/api/admin/categories`,     { method: "POST", body: JSON.stringify({ name, slug }) });
      catModal.hide(); await loadCategories(); await loadSummary();
      showMsg(id ? "Categoría actualizada" : "Categoría creada");
    } catch (e2) { showMsg("Error: " + e2.message); }
  });

  // Manejo global de clicks para editar y borrar categorías
  document.addEventListener("click", async (ev) => {
    const edit = ev.target.closest?.("[data-edit-cat]");
    if (edit) {
      const id = Number(edit.getAttribute("data-edit-cat"));
      const c = CATS.find(x => x.id === id); if (!c) return;
      $("#catModalTitle").textContent = "Editar categoría";
      catId.value = c.id; catName.value = c.name || ""; catSlug.value = c.slug || "";
      catModal.show(); return;
    }
    const del = ev.target.closest?.("[data-del-cat]");
    if (del) {
      const id = Number(del.getAttribute("data-del-cat"));
      if (!confirm("¿Eliminar categoría " + id + "?")) return;
      try { await api(`/api/admin/categories/${id}`, { method: "DELETE" }); await loadCategories(); await loadSummary(); showMsg("Categoría eliminada"); }
      catch (e2) { showMsg("Error: " + e2.message); }
    }
  });

  // ==================== productos ====================
  const prodBody     = $("#prodBody");
  const qProd        = $("#qProd");
  const catFilter    = $("#catFilter");
  const btnSearchProd= $("#btnSearchProd");
  const btnReloadProd= $("#btnReloadProd");
  const prevPage     = $("#prevPage");
  const nextPage     = $("#nextPage");
  const pageNum      = $("#pageNum");
  const btnNewProd   = $("#btnNewProd");

  const prodModal    = new bootstrap.Modal("#prodModal");
  const prodForm     = $("#prodForm");
  const prodId       = $("#prodId");
  const prodName     = $("#prodName");
  const prodSlug     = $("#prodSlug");
  const prodDesc     = $("#prodDesc");
  const prodPrice    = $("#prodPrice");     // <- input en PESOS
  const prodStock    = $("#prodStock");
  const prodCategory = $("#prodCategory");
  const prodImage    = $("#prodImage");
  const prodPreview  = $("#prodPreview");

  // Paginador del listado de productos
  const PAGER = { page: 1, size: 20, total: 0 };

  // Lleno el filtro de categoría del listado de productos
  function populateCatFilter() {
    if (!catFilter) return;
    catFilter.innerHTML =
      `<option value="">Todas</option>` + CATS.map(c => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join("");
  }
  // Lleno el select de categoría del formulario de producto
  function populateCatSelect() {
    if (!prodCategory) return;
    prodCategory.innerHTML =
      `<option value="">(sin categoría)</option>` + CATS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  }

  // Imagen de tabla (si no viene nada, lo dejo vacío)
  function resolveImg(p){
    if (p.image_url) return `${p.image_url}?v=${p.id}`;
    try {
      if (Array.isArray(p.images) && p.images.length) return p.images[0];
      if (typeof p.images === "string") {
        const arr = JSON.parse(p.images);
        if (Array.isArray(arr) && arr.length) return arr[0];
      }
    } catch {}
    return "";
  }

  // Cargo los productos del admin y los pinto en la tabla
  async function loadProducts() {
    if (prodBody) prodBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Cargando…</td></tr>`;
    try {
      const params = new URLSearchParams();
      if (qProd?.value.trim()) params.set("q", qProd.value.trim());
      if (catFilter?.value)   params.set("category", String(catFilter.value));
      params.set("page", String(PAGER.page));
      params.set("size", String(PAGER.size));
      const data = await api(`/api/admin/products?` + params.toString());
      PAGER.total = Number(data.total || 0);
      if (pageNum) pageNum.textContent = String(PAGER.page);
      const items = data.items || [];
      if (!items.length) {
        if (prodBody) prodBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Sin resultados</td></tr>`;
        return;
      }
      if (!prodBody) return;
      prodBody.innerHTML = items.map(p => {
        const src = resolveImg(p);
        const img = src ? `<img src="${src}" alt="" class="prod-thumb" onerror="this.src='images/monstera.jpg';this.onerror=null;">` : "";
        // Muestro el precio tal cual viene (en pesos), sin dividir por 100.
        return `
        <tr>
          <td>${p.id}</td>
          <td>${img}</td>
          <td>
            <div class="fw-semibold">${esc(p.name || "")}</div>
            <div class="small text-muted">${esc(p.slug || "")}</div>
          </td>
          <td>${esc(p.category_name || "")}</td>
          <td class="text-end">${fmtCOP(p.price_cents)}</td>
          <td class="text-end">${p.stock ?? 0}</td>
          <td>
            <button class="btn btn-outline-secondary btn-sm me-1" data-edit-prod='${JSON.stringify(p).replace(/'/g,"&#39;")}'><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger btn-sm" data-del-prod="${p.id}"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`;
      }).join("");
    } catch (e) {
      if (prodBody) prodBody.innerHTML = `<tr><td colspan="7" class="text-danger">Error: ${esc(e.message)}</td></tr>`;
    }
  }

  // Búsqueda / paginación
  btnSearchProd?.addEventListener("click", () => { PAGER.page = 1; loadProducts(); });
  btnReloadProd?.addEventListener("click", loadProducts);
  prevPage?.addEventListener("click", () => { if (PAGER.page > 1) { PAGER.page--; loadProducts(); } });
  nextPage?.addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(PAGER.total / PAGER.size));
    if (PAGER.page < maxPage) { PAGER.page++; loadProducts(); }
  });

  // Nuevo producto: limpio el formulario y muestro el modal
  btnNewProd?.addEventListener("click", () => {
    $("#prodModalTitle").textContent = "Nuevo producto";
    prodForm?.reset();
    prodId.value = "";
    if (prodPreview) { prodPreview.src = ""; prodPreview.classList.add("d-none"); }
    prodModal.show();
  });

  // Preview imagen cuando selecciono un archivo
  prodImage?.addEventListener("change", () => {
    const f = prodImage.files?.[0];
    if (f) { prodPreview.src = URL.createObjectURL(f); prodPreview.classList.remove("d-none"); }
    else   { prodPreview.src = ""; prodPreview.classList.add("d-none"); }
  });

  // Guardar producto (crear o editar)
  prodForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = (prodId.value || "").trim();

    // Armo el FormData con los campos del producto
    const fd = new FormData();
    fd.set("name", String(prodName.value || "").trim());
    if (prodSlug.value.trim()) fd.set("slug", prodSlug.value.trim());
    if (prodDesc.value.trim()) fd.set("description", prodDesc.value.trim());

    // Aquí envío "price_cents" como PESOS tal cual lo escribo.
    fd.set("price_cents", String(parsePesos(prodPrice.value)));

    fd.set("stock", String(parseInt(prodStock.value || "0", 10)));
    if (prodCategory.value) fd.set("category_id", prodCategory.value);
    if (prodImage.files && prodImage.files[0]) fd.set("image", prodImage.files[0]);

    try {
      if (id) {
        await api(`/api/admin/products/${id}`, { method: "PUT", body: fd });
        showMsg("Producto actualizado");
      } else {
        await api(`/api/admin/products`, { method: "POST", body: fd });
        showMsg("Producto creado");
      }
      prodModal.hide();
      await loadProducts();
      await loadSummary();
    } catch (err) {
      showMsg("Error: " + err.message);
    }
  });

  // Editar / Eliminar producto
  document.addEventListener("click", async (ev) => {
    const btnE = ev.target.closest?.("[data-edit-prod]");
    if (btnE) {
      // Leo el producto que viene serializado en el data-*
      const p = JSON.parse(btnE.getAttribute("data-edit-prod").replace(/&#39;/g, "'"));
      $("#prodModalTitle").textContent = "Editar producto";
      prodForm?.reset();
      prodId.value   = p.id;
      prodName.value = p.name || "";
      prodSlug.value = p.slug || "";
      prodDesc.value = p.description || "";

      // Al editar, pongo el precio tal cual viene de la API, (ya en pesos).
      prodPrice.value = String(p.price_cents || 0);

      prodStock.value    = p.stock ?? 0;
      prodCategory.value = p.category_id || "";
      const src = resolveImg(p);
      if (src) { prodPreview.src = src + "&pv=1"; prodPreview.classList.remove("d-none"); }
      else     { prodPreview.src = "";            prodPreview.classList.add("d-none"); }
      prodModal.show();
      return;
    }

    const btnD = ev.target.closest?.("[data-del-prod]");
    if (btnD) {
      const id = btnD.getAttribute("data-del-prod");
      if (!confirm(`¿Eliminar producto ${id}?`)) return;
      try {
        await api(`/api/admin/products/${id}`, { method: "DELETE" });
        await loadProducts();
        await loadSummary();
        showMsg("Producto eliminado");
      } catch (err) {
        showMsg("Error: " + err.message);
      }
    }
  });

  // Al cargar el admin, traigo el resumen, las categorías y los productos
  (async function init() {
    await loadSummary();
    await loadCategories();
    await loadProducts();
  })();
})();
