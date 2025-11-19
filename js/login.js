// js/login.js
(() => {
  // Guardo la URL base de mi API backend
  const API = "http://127.0.0.1:4000";
  // Referencia al formulario de inicio de sesión
  const f = document.getElementById("loginForm");
  // Este input puede ser correo o usuario (según lo que escriba la persona)
  const inputId = document.getElementById("loginId");        // puede ser correo o usuario
  // Input de la contraseña
  const inputPass = document.getElementById("loginPassword");
  // Botón de "Iniciar sesión"
  const btn = document.getElementById("btnLogin");

  // Elemento del toast donde muestro mensajes de login
  const toastEl = document.getElementById("toastAuth");
  // Instancio el toast de Bootstrap si existe, si no, me queda null
  const toast = toastEl ? bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 1600 }) : null;

  // Con esta función muestro mensajes de forma bonita
  function showMsg(msg) {
    if (toast) {
      // Si tengo toast, uso el texto del cuerpo y lo muestro
      toastEl.querySelector(".toast-body").textContent = msg;
      toast.show();
    } else {
      // Si no hay toast, uso alert como plan B
      alert(msg);
    }
  }

  // Función para hacer POST al backend de forma genérica
  async function post(path, body) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Aquí convierto el objeto body a JSON
      body: JSON.stringify(body),
    });
    // Intento leer la respuesta como JSON, si falla dejo un objeto vacío
    const data = await res.json().catch(() => ({}));
    // Si el status no es OK, lanzo un error con el mensaje que venga
    if (!res.ok) throw new Error(data?.error || res.statusText);
    return data;
  }

  // Aquí conecto el submit del formulario de login
  f?.addEventListener("submit", async (e) => {
    // Evito que se recargue la página por defecto
    e.preventDefault();
    // Leo el valor del identificador (correo o usuario)
    const id = (inputId?.value || "").trim();
    // Leo la contraseña
    const password = inputPass?.value || "";
    // Si falta algo, muestro mensaje y no sigo
    if (!id || !password) return showMsg("Completa tus credenciales");

    // Desactivo el botón mientras hago la petición
    btn?.setAttribute("disabled", "disabled");

    try {
      // El backend acepta varios nombres para el mismo campo (id/email/username)
      const data = await post("/api/auth/login", { id, password });
      // Guardo el token en localStorage (persistente)
      localStorage.setItem("token", data.token);
      // Y también en sessionStorage (para la sesión actual)
      sessionStorage.setItem("token", data.token);
      // Aviso que todo salió bien
      showMsg("¡Bienvenido!");
      // Redirijo a la página de inicio (o la que yo quiera)
      window.location.href = "inicio.html"; // o a donde prefieras
    } catch (err) {
      // Si hay error, muestro el mensaje que venga del backend o uno genérico
      showMsg(err.message || "Error al iniciar sesión");
    } finally {
      // Pase lo que pase, vuelvo a habilitar el botón
      btn?.removeAttribute("disabled");
    }
  });
})();
