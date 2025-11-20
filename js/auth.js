// js/auth.js
// Aquí manejo todo lo relacionado con autenticación en el front
import { api, getToken, setToken } from './api.js';

// Manejo el usuario que guardo en sessionStorage
function getUser() {
  const raw = sessionStorage.getItem('user');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function setUser(u) {
  if (u) sessionStorage.setItem('user', JSON.stringify(u));
  else sessionStorage.removeItem('user');
}

// Devuelvo true si tengo token (usuario logueado)
export function isLoggedIn() {
  return !!getToken();
}

// Con esto ajusto la UI de la navbar según si hay sesión o no
export function applyAuthUI() {
  const navLogin = document.getElementById('nav-login');
  const navUser  = document.getElementById('nav-user');
  const usernameEl = document.getElementById('nav-username');
  const btnLogout  = document.getElementById('btn-logout');
  const u = getUser();

  if (isLoggedIn() && u) {
    // Si hay sesión, muestro bloque de usuario
    navLogin && navLogin.classList.add('d-none');
    navUser  && navUser.classList.remove('d-none');
    if (usernameEl) usernameEl.textContent = u.username || 'Mi cuenta';
  } else {
    // Si no hay sesión, muestro el botón de login
    navUser  && navUser.classList.add('d-none');
    navLogin && navLogin.classList.remove('d-none');
  }

  // Botón de cerrar sesión
  if (btnLogout) {
    btnLogout.onclick = () => {
      setToken(null);
      setUser(null);
      location.reload();
    };
  }
}

// LOGIN form
// Aquí conecto el formulario de login con la API
export function wireLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('loginIdentifier')?.value.trim();
    const password   = document.getElementById('loginPassword')?.value;
    try {
      const { token, user } = await api.login({ identifier, password });
      // Guardo token y datos del usuario en sesión
      setToken(token); setUser(user);
      // Redirijo a la página principal
      location.href = 'index.html'; //Pagina principal
    } catch (err) {
      alert(err.message || 'Error al iniciar sesión');
    }
  });
}

// REGISTER form
// Aquí conecto el formulario de registro con la API
export function wireRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('regEmail')?.value.trim();
    const username = document.getElementById('regUsername')?.value.trim();
    const password = document.getElementById('regPassword')?.value;
    try {
      const { token, user } = await api.register({ email, username, password });
      // Después de registrar, dejo al usuario logueado de una vez
      setToken(token); setUser(user);
      location.href = 'index.html';
    } catch (err) {
      alert(err.message || 'Error al registrarse');
    }
  });
}
