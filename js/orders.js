// js/orders.js - pedidos admin
(() => {
  // URL base de mi API
  const API = "http://127.0.0.1:4000";
  // Atajos para el DOM
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Autenticación: saco el token del storage
  const token = localStorage.getItem("token") || sessionStorage.getItem("token") || null;
  // Cabeceras que voy a mandar a la API cuando necesito auth
  const authHeaders = token ? { Authorization: "Bearer " + token } : {};

  // ==== Helpers generales ====

  // Formateo números a pesos colombianos (COP)
  const fmtCOP = (n) =>
    Number(n || 0).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    });

  // Notificación flotante usando clases de alert de Bootstrap
  function showNotification(text, type = "success") {
    const div = document.createElement("div");
    const bsType = type === "error" ? "danger" : type; // convierto "error" en "danger"
    div.className =
      "alert alert-" +
      bsType +
      " position-fixed bottom-0 end-0 m-3 shadow-lg";
    div.role = "alert";
    div.textContent = text;
    document.body.appendChild(div);
    // La alerta se quita sola después de un rato
    setTimeout(() => div.remove(), 3500);
  }

  // GET genérico a la API con auth
  async function apiGet(path) {
    const r = await fetch(API + path, {
      headers: { "Content-Type": "application/json", ...authHeaders },
      cache: "no-store",
    });
    if (!r.ok) throw new Error("API " + r.status);
    return r.json();
  }

  // POST genérico a la API con auth
  async function apiPost(path, body) {
    const r = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data && data.error) || `Error ${r.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ==== Refs UI ====

  // Filtros y campos del listado de pedidos
  const ordMonth  = $("#ordMonth");
  const ordYear   = $("#ordYear");
  const qOrder    = $("#qOrder");
  const btnSearchOrder = $("#btnSearchOrder");
  // Cuerpo de la tabla donde pinto los pedidos
  const orderBody = $("#orderBody");
  // Botón para crear un nuevo pedido manual
  const btnNewOrder = $("#btnNewOrder");

  // Modal para crear pedidos
  const orderModalEl = document.getElementById("orderModal");
  const orderModal   = orderModalEl ? new bootstrap.Modal(orderModalEl) : null;

  // Refs del formulario del modal de pedidos
  const orderForm   = $("#orderForm");
  const ordItems    = $("#ordItems");  // tabla interna con las filas de items
  const btnAddRow   = $("#btnAddRow"); // botón para añadir fila de producto
  const ordTotalEl  = $("#ordTotal");  // total del pedido
  const ordDate     = $("#ordDate");   // fecha/hora del pedido
  const ordCustomer = $("#ordCustomer"); // nombre del cliente
  const ordPhone    = $("#ordPhone");  // telefono del cliente
  const prodListDL  = $("#prodList");  // datalist para autocompletar productos

  // ==== Productos para datalist ====
  // Aquí guardo la lista de productos disponibles para llenar filas rápido
  let PRODUCTS = [];

  // Cargo productos desde admin para llenar el datalist que uso al crear pedidos
  async function loadProductsForList() {
    try {
      const d = await apiGet(`/api/admin/products?size=1000&page=1`);
      // Me quedo con lo más importante de cada producto
      PRODUCTS = (d.items || []).map((p) => ({
        id: p.id,
        name: p.name,
        category_name: p.category_name || "",
        price: p.price_cents || p.price || 0,
      }));
      // Lleno el datalist con nombre de producto, categoría y precio
      if (prodListDL) {
        prodListDL.innerHTML = PRODUCTS.map(
          (p) =>
            `<option value="${p.name}">${p.category_name ? p.category_name + " – " : ""}${fmtCOP(
              p.price
            )}</option>`
        ).join("");
      }
    } catch (e) {
      console.error("No se pudieron cargar productos", e);
      PRODUCTS = [];
      if (prodListDL) prodListDL.innerHTML = "";
    }
  }

  // ==== Mes / año ====

  // Lleno los selects de mes y año con valores útiles
  function fillMonthYear(selM, selY) {
    if (selM) {
      const months = [
        "Enero","Febrero","Marzo","Abril","Mayo","Junio",
        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
      ];
      selM.innerHTML = months.map((m,i)=>`<option value="${i+1}">${m}</option>`).join("");
      // Dejo por defecto el mes actual
      selM.value = String(new Date().getMonth() + 1);
    }
    if (selY) {
      const nowY = new Date().getFullYear();
      // Creo un rango de 7 años (3 antes y 3 después del actual)
      selY.innerHTML = Array.from({length:7},(_,k)=>nowY-3+k)
        .map((y)=>`<option value="${y}" ${y===nowY?"selected":""}>${y}</option>`)
        .join("");
      selY.value = String(nowY);
    }
  }

  // ==== Cargar pedidos ====

  // Cargo los pedidos del backend y los pinto en la tabla
  async function loadOrders() {
    if (!orderBody) return;

    // Mensaje de cargando mientras llega la info
    orderBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">Cargando…</td>
      </tr>
    `;

    try {
      const params = new URLSearchParams();
      // Filtro por mes, año y texto si están definidos
      if (ordMonth?.value) params.set("month", ordMonth.value);
      if (ordYear?.value)  params.set("year", ordYear.value);
      if (qOrder?.value.trim()) params.set("q", qOrder.value.trim());

      const data = await apiGet(`/api/admin/orders?${params.toString()}`);
      const items = data.items || [];

      // Si no hay pedidos, muestro mensaje
      if (!items.length) {
        orderBody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center text-muted py-4">
              No hay pedidos en este periodo.
            </td>
          </tr>
        `;
        return;
      }

      // Pinto cada pedido como una fila en la tabla
      orderBody.innerHTML = items
        .map((o, idx) => {
          const dt = o.date ? new Date(o.date) : null;
          const fecha = dt
            ? dt.toLocaleString("es-CO", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—";
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${fecha}</td>
              <td>${o.customer_name || "—"}</td>
              <td class="text-end">${o.items_count ?? 0}</td>
              <td class="text-end">${fmtCOP(o.total ?? 0)}</td>
              <td class="text-center">
                <button type="button" class="btn btn-outline-secondary btn-sm" disabled>
                  <i class="bi bi-eye"></i>
                </button>
              </td>
            </tr>
          `;
        })
        .join("");
    } catch (e) {
      console.error("Error cargando pedidos", e);
      // Si algo falla, muestro mensaje de error en la tabla
      orderBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-danger py-4">
            Error al cargar pedidos
          </td>
        </tr>
      `;
    }
  }

  // ==== Filas dinámicas ====

  // Convierto el valor de un input numérico a número limpio (sin puntos)
  function numberVal(input) {
    const n = Number(String(input.value || "0").replace(/\./g,""));
    return Number.isFinite(n) ? n : 0;
  }

  // Recalculo el subtotal de una fila (precio * cantidad)
  function recalcRow(row) {
    const price = numberVal(row.querySelector(".ord-price"));
    const qty   = Math.max(1, parseInt(row.querySelector(".ord-qty").value || "1", 10));
    row.querySelector(".ord-sub").textContent = fmtCOP(price * qty);
  }

  // Recalculo el total del pedido sumando todas las filas
  function recalcTotal() {
    let total = 0;
    $$("#ordItems tr").forEach((row) => {
      const price = numberVal(row.querySelector(".ord-price"));
      const qty   = Math.max(1, parseInt(row.querySelector(".ord-qty").value || "1", 10));
      total += price * qty;
    });
    if (ordTotalEl) ordTotalEl.textContent = fmtCOP(total);
    return total;
  }

  // Agrego una nueva fila de producto al pedido (puede venir con datos iniciales)
  function addRow(seed = null) {
    if (!ordItems) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <input class="form-control form-control-sm ord-prod" list="prodList"
               placeholder="Producto…" value="${seed?.name || ""}">
        <div class="small text-muted ord-cat">${seed?.category_name || ""}</div>
        <input type="hidden" class="ord-id" value="${seed?.id || ""}">
      </td>
      <td>
        <input class="form-control form-control-sm ord-price" type="number" min="0" step="1"
               value="${seed?.price || 0}">
      </td>
      <td>
        <input class="form-control form-control-sm ord-qty" type="number" min="1" step="1"
               value="${seed?.qty || 1}">
      </td>
      <td class="text-end ord-sub">${fmtCOP((seed?.price || 0) * (seed?.qty || 1))}</td>
      <td>
        <button type="button" class="btn btn-outline-danger btn-sm ord-del">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    `;
    ordItems.appendChild(tr);
    // Cada vez que agrego fila, recalculo el total
    recalcTotal();
  }

  // Botón que añade una fila nueva vacía
  btnAddRow?.addEventListener("click", () => addRow());

  // Manejo cambios dentro de la tabla de items (nombre, precio, cantidad)
  ordItems?.addEventListener("input", (ev) => {
    const row = ev.target.closest("tr");
    if (!row) return;

    // Si cambia el nombre del producto, intento auto-completar precio y categoría
    if (ev.target.classList.contains("ord-prod")) {
      const name = ev.target.value.trim().toLowerCase();
      const p = PRODUCTS.find((x) => x.name.toLowerCase() === name);
      if (p) {
        row.querySelector(".ord-id").value = p.id;
        row.querySelector(".ord-price").value = p.price;
        row.querySelector(".ord-cat").textContent = p.category_name || "";
      } else {
        row.querySelector(".ord-id").value = "";
        row.querySelector(".ord-cat").textContent = "";
      }
    }

    // Actualizo subtotal y total cada vez que se cambia algo
    recalcRow(row);
    recalcTotal();
  });

  // Manejo clicks en la tabla para borrar filas
  ordItems?.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".ord-del");
    if (!btn) return;
    const row = btn.closest("tr");
    if (row) row.remove();
    recalcTotal();
  });

  // ==== Abrir modal nuevo pedido ====

  // Cuando hago clic en “Nuevo pedido”
  btnNewOrder?.addEventListener("click", async () => {
    if (!orderModal) return;
    // Limpio formulario y tabla de items
    orderForm?.reset();
    if (ordItems) ordItems.innerHTML = "";
    if (ordTotalEl) ordTotalEl.textContent = fmtCOP(0);

    // Pongo la fecha por defecto con la fecha/hora actual
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    if (ordDate) {
      ordDate.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
        now.getDate()
      )}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    // Cargo productos para el datalist y agrego una fila inicial
    await loadProductsForList();
    addRow();
    // Muestro el modal
    orderModal.show();
  });

  // ==== Guardar pedido ====

  // Manejo el submit del formulario de nuevo pedido
  orderForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Armo un arreglo con los items del pedido
    const items = [];
    $$("#ordItems tr").forEach((row) => {
      const name = row.querySelector(".ord-prod").value.trim();
      const idVal = row.querySelector(".ord-id").value;
      const product_id = idVal ? Number(idVal) : null;
      const price = numberVal(row.querySelector(".ord-price"));
      const qty   = Math.max(1, parseInt(row.querySelector(".ord-qty").value || "1", 10));

      if (name && price >= 0) {
        items.push({ product_id, name, qty, unit_price: price });
      }
    });

    // Si no hay items, aviso y no sigo
    if (!items.length) {
      showNotification("Agrega al menos un ítem.", "error");
      return;
    }

    // Armo el objeto principal con encabezado del pedido + items
    const payload = {
      date: new Date(ordDate?.value || new Date()).toISOString(),
      customer: {
        full_name: (ordCustomer?.value || "").trim() || null,
        phone: (ordPhone?.value || "").trim() || null,
      },
      items,
    };

    try {
      // Envío el pedido al backend
      await apiPost("/api/admin/orders", payload);
      showNotification("Pedido guardado correctamente 🎉", "success");
      orderModal?.hide();
      // Recargo el listado de pedidos
      await loadOrders();
      // Lanzo un evento global para que otras partes (reportes) se actualicen
      document.dispatchEvent(new CustomEvent("orders:changed"));
    } catch (e) {
      console.error("No se pudo guardar el pedido", e);
      showNotification("No se pudo guardar el pedido: " + e.message, "error");
    }
  });

  // ==== Init ====

  // Filtros y listado inicial de pedidos
  btnSearchOrder?.addEventListener("click", loadOrders);
  ordMonth?.addEventListener("change", loadOrders);
  ordYear?.addEventListener("change", loadOrders);

  (async function init() {
    // Lleno los selects de mes y año
    fillMonthYear(ordMonth, ordYear);
    // Cargo productos para el datalist
    await loadProductsForList();
    // Cargo los pedidos del periodo actual
    await loadOrders();
  })();
})();
