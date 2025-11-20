// js/main.js
(() => {
  // URL base de la API que uso en esta página
const API = "https://vivero-back.onrender.com";


  // --- Helpers DOM ---
  // Atajo para buscar un solo elemento
  const $  = (s) => document.querySelector(s);
  // Atajo para buscar varios elementos y convertirlos en array
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  // Con esto puedo poner el mismo texto en varios elementos a la vez
  const setTextAll = (sel, txt) => $$(sel).forEach(el => el.textContent = txt);

  // Borro el carrito viejo genérico si todavía existe (lo usaba antes)
  try { localStorage.removeItem("lc_cart"); } catch {}

  // --- Tomamos todo desde app.js para no duplicar lógica ---
  // Aquí leo las funciones globales que expuse en window.__vivero desde app.js
  const sess = window.__vivero || {};
  // Si existen las funciones de sesión del otro archivo, las uso; si no, uso un plan B simple
  const getToken    = () => (sess.getToken    ? sess.getToken()    : (localStorage.getItem("token") || sessionStorage.getItem("token") || null));
  const isLoggedIn  = () => (sess.isLoggedIn  ? sess.isLoggedIn()  : !!getToken());
  const getClaims   = () => (sess.getClaims   ? sess.getClaims()   : null);
  const readCart    = () => (sess.readCart    ? sess.readCart()    : []);
  const renderCart  = () => (sess.renderCart  ? sess.renderCart()  : null);

  // --- Navbar state ---
  // Aquí ajusto la parte de arriba (navbar) según si hay sesión o no
  function hydrateNavbar(){
    const banner = $("#authBanner");   // banner de bienvenida o de “crear cuenta”
    const cta = $("#nav-auth-cta");    // botón de llamada a la acción (login/registro)
    const prof = $("#nav-profile");    // menú de perfil
    const usernameEl = $("#nav-username"); // texto con el nombre del usuario
    const avatar = $("#nav-avatar");   // círculo con inicial del usuario

    if (isLoggedIn()) {
      // Si hay sesión, oculto cosas de “login” y muestro el perfil
      const cl = getClaims();
      banner?.classList.add("d-none");
      cta?.classList.add("d-none");
      prof?.classList.remove("d-none");
      // Muestro username o email en la navbar
      usernameEl && (usernameEl.textContent = cl?.username || cl?.email || "Mi cuenta");
      // Creo una inicial para el avatar (primera letra del nombre/correo)
      if (avatar) {
        const name = cl?.username || cl?.email || "U";
        const ini = String(name).trim().split(/\s+/)[0]?.[0]?.toUpperCase() || "U";
        avatar.textContent = ini;
      }
    } else {
      // Si no hay sesión, muestro banner y botón de auth, y oculto perfil
      banner?.classList.remove("d-none");
      cta?.classList.remove("d-none");
      prof?.classList.add("d-none");
    }
  }

  // --- Wishlist badge ---
  // Pido al backend cuántos productos tengo en favoritos
  async function fetchWishlistCount(){
    if (!isLoggedIn()) return 0;
    try {
      const res = await fetch(API + "/api/wishlist", {
        headers: { Authorization: "Bearer " + getToken() },
        cache: "no-store",
      });
      if (!res.ok) return 0;
      const data = await res.json();
      // Devuelvo la cantidad de items en la lista
      return (data.items || []).length || 0;
    } catch { return 0; }
  }

  // --- Badges (wishlist + carrito por usuario) ---
  // Actualizo los numeritos de wishlist y carrito en la navbar
  async function fillBadges(){
    // Pongo en cero de entrada por si el HTML traía valores “duros” (como 25 falso)
    setTextAll("#wish-count", "0");
    setTextAll("#cart-count", "0");

    // wishlist
    const wc = await fetchWishlistCount();
    setTextAll("#wish-count", String(wc));

    // carrito (leo el carrito que viene de app.js)
    const items = readCart();
    const cc = isLoggedIn() ? items.reduce((a,i)=>a + (i.qty||1), 0) : 0;
    setTextAll("#cart-count", String(cc));
  }

  // --- Modal login requerido (solo si no existe ya) ---
  // Muestra un modal de “Inicia sesión” si el usuario intenta hacer algo protegido
  function openLoginRequired(){
    const el = document.getElementById("loginRequiredModal");
    if (el && window.bootstrap) window.bootstrap.Modal.getOrCreateInstance(el).show();
    else alert("Inicia sesión para continuar.");
  }
  // Si en window todavía no existe requireLogin, lo defino aquí
  if (!window.requireLogin) {
    window.requireLogin = function(){ if (!isLoggedIn()) { openLoginRequired(); return false; } return true; };
  }

  // --- Logout ---
  // Botón de salir en esta página
  $("#btn-logout")?.addEventListener("click", () => {
    // Borro el token de los dos storages
    localStorage.removeItem("token"); sessionStorage.removeItem("token");
    // Redirijo al inicio
    location.href = "index.html";
  });

  // --- init ---
  (async function init(){
    // Antes de nada, fuerzo que los badges se vean en cero
    setTextAll("#cart-count", "0");
    setTextAll("#wish-count", "0");

    // Ajusto la navbar según la sesión
    hydrateNavbar();
    // Lleno los badges de wishlist y carrito
    await fillBadges();

    // Escucho cambios en storage (por ejemplo, si el usuario inicia/cierra sesión en otra pestaña)
    window.addEventListener("storage", (ev) => {
      if (!ev.key) return;
      if (ev.key === "token" || ev.key.startsWith("lc_cart_")) {
        // Cada vez que cambien token o carritos de usuario, actualizo navbar, badges y carrito
        try { hydrateNavbar(); } catch {}
        try { fillBadges(); } catch {}
        try { renderCart(); } catch {}
      }
    });
  })();
})();
