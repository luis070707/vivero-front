// js/perfil.js
(() => {
  // URL base de mi API
  const API = "http://127.0.0.1:4000";
  // Atajo para seleccionar un solo elemento
  const $ = (s) => document.querySelector(s);

  // Saco el token de donde lo tenga guardado
  function token() { return localStorage.getItem("token") || sessionStorage.getItem("token"); }
  // Con esto no dejo entrar a esta página si no hay sesión
  function guard()  { if (!token()) location.href = "login.html"; }
  // Llamo al guard apenas carga el script
  guard();

  // Función genérica para llamar la API con auth
  async function api(path, init = {}) {
    const res = await fetch(API + path, {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        // Siempre mando el token en el header Authorization
        Authorization: "Bearer " + token(),
        ...(init.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  // Campos activos en el nuevo diseño del perfil que sí quiero editar
  const fields = ["full_name","phone","address_line1","address_line2","city"];
  // Toast para mostrar “guardado” de forma rápida
  const toast = bootstrap.Toast.getOrCreateInstance("#toastOK", { delay: 1200 });

  // Cargo los datos del usuario actual y los pongo en el formulario
  async function load() {
    const u = await api("/api/me");
    // El email lo dejo en modo lectura (solo muestro)
    $("#email").value = u.email || "";
    // Para cada campo del arreglo, copio el valor que venga del backend
    for (const k of fields) $("#"+k).value = u[k] || "";
  }

  // Cuando el usuario envía el formulario, guardo los cambios
  $("#profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {};
    // Armo un objeto con los campos que quiero actualizar
    for (const k of fields) body[k] = $("#"+k).value.trim();
    // Hago PUT al endpoint /api/me con los nuevos datos
    await api("/api/me", { method: "PUT", body: JSON.stringify(body) });
    // Muestro el toast de “OK”
    toast.show();
  });

  // Al cargar el script, intento traer los datos del usuario
  load().catch(err => alert(err.message));
})();
