// js/reports.js - solo con datos de la API
(() => {
  // URL base de mi API
  const API = "http://127.0.0.1:4000";
  // Helper rápido para el DOM
  const $  = (s) => document.querySelector(s);

  // Leo el token para auth
  const token = localStorage.getItem("token") || sessionStorage.getItem("token") || null;
  // Headers que uso para las peticiones autenticadas
  const authHeaders = token ? { Authorization: "Bearer " + token } : {};

  // Formateo números a pesos colombianos (COP)
  const fmtCOP = (n) =>
    Number(n || 0).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    });

  // Lleno selects de mes y año con valores útiles
  function fillMonthYear(selM, selY) {
    if (selM) {
      const months = [
        "Enero","Febrero","Marzo","Abril","Mayo","Junio",
        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
      ];
      selM.innerHTML = months.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
      selM.value = String(new Date().getMonth() + 1);
    }
    if (selY) {
      const nowY = new Date().getFullYear();
      selY.innerHTML = Array.from({ length: 7 }, (_, k) => nowY - 3 + k)
        .map((y) => `<option value="${y}" ${y === nowY ? "selected" : ""}>${y}</option>`)
        .join("");
      selY.value = String(nowY);
    }
  }

  // Refs a los filtros y controles de reportes
  const repMonth = $("#repMonth");
  const repYear  = $("#repYear");
  const btnReloadSales = $("#btnReloadSales");
  const topPeriod = $("#topPeriod");
  const topMonth  = $("#topMonth");
  const topYear   = $("#topYear");
  const topFilters= $("#topFilters");

  // Lleno los combos de mes/año para las dos secciones (ventas y top productos)
  fillMonthYear(repMonth, repYear);
  fillMonthYear(topMonth, topYear);

  // Mantengo referencias a las gráficas de Chart.js para poder destruirlas antes de crear nuevas
  let salesChart, topChart;

  // Creo/actualizo la gráfica de ventas (línea)
  function makeLine(ctx, labels, values) {
    // Si ya hay gráfica, la destruyo
    if (salesChart) salesChart.destroy();
    // Creo una nueva línea con Chart.js
    salesChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Ventas (COP)",
            data: values,
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        scales: {
          y: {
            ticks: {
              // Cada etiqueta del eje Y la muestro formateada como COP
              callback: (v) => fmtCOP(v),
            },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  // Creo/actualizo la gráfica de top productos (barras)
  function makeBar(ctx, labels, values) {
    if (topChart) topChart.destroy();
    topChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Unidades",
            data: values,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  // GET sencillo a la API con auth
  async function apiGet(path) {
    const r = await fetch(API + path, {
      headers: { "Content-Type": "application/json", ...authHeaders },
      cache: "no-store",
    });
    if (!r.ok) throw new Error("API " + r.status);
    return r.json();
  }

  // Carga la gráfica de ventas por día/mes según los filtros
  async function loadSales() {
    const ctx = document.getElementById("salesChart")?.getContext("2d");
    if (!ctx) return;

    try {
      const p = new URLSearchParams({ month: repMonth.value, year: repYear.value });
      const d = await apiGet(`/api/admin/reports/sales?${p.toString()}`);
      // d.labels y d.values vienen del backend
      makeLine(ctx, d.labels || [], d.values || []);
    } catch (e) {
      console.error("Error cargando ventas", e);
      // Si algo falla, pinto una gráfica vacía
      makeLine(ctx, [], []);
    }
  }

  // Muestro u oculto los filtros de top según el tipo de periodo elegido
  function toggleTopFilters() {
    if (!topFilters) return;
    topFilters.style.display = topPeriod.value === "all" ? "none" : "";
  }

  // Carga la gráfica de productos más vendidos
  async function loadTop() {
    const ctx = document.getElementById("topChart")?.getContext("2d");
    if (!ctx) return;

    const period = topPeriod.value;
    const p = new URLSearchParams();
    // Según el periodo, mando mes/año o solo año
    if (period === "month") {
      p.set("month", topMonth.value);
      p.set("year", topYear.value);
    } else if (period === "year") {
      p.set("year", topYear.value);
    }

    try {
      const d = await apiGet(`/api/admin/reports/top-products?${p.toString()}`);
      makeBar(ctx, d.labels || [], d.values || []);
    } catch (e) {
      console.error("Error cargando top productos", e);
      // Si algo falla, pinto una gráfica vacía
      makeBar(ctx, [], []);
    }
  }

  // Eventos
  // Botón que recarga la gráfica de ventas
  btnReloadSales?.addEventListener("click", loadSales);
  // Cuando cambien mes o año de ventas, recargo
  [repMonth, repYear].forEach((sel) => sel?.addEventListener("change", loadSales));
  // Cuando cambien mes o año de top productos, recargo esa gráfica
  [topMonth, topYear].forEach((sel) => sel?.addEventListener("change", loadTop));
  // Cuando cambio el tipo de periodo del top, muestro/oculto filtros y recargo
  topPeriod?.addEventListener("change", () => {
    toggleTopFilters();
    loadTop();
  });

  // Si los pedidos cambian (por ejemplo, se crea uno nuevo), refresco las dos gráficas
  document.addEventListener("orders:changed", () => {
    loadSales();
    loadTop();
  });

  // init
  (async function init() {
    // Ajusto visibilidad de filtros del top
    toggleTopFilters();
    // Cargo ambas gráficas al entrar a la página
    await loadSales();
    await loadTop();
  })();
})();
