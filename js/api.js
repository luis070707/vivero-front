// js/api.js
// Aquí centralizo las llamadas al backend y el manejo del token (para auth simple en el front)

// Devuelvo el token guardado en sessionStorage
export function getToken() {
  return sessionStorage.getItem('token') || null;
}

// Guardo o borro el token según venga un valor o null
export function setToken(t) {
  if (t) sessionStorage.setItem('token', t);
  else sessionStorage.removeItem('token');
}

// Función genérica para hacer peticiones HTTP a mi API
export async function request(path, { method = 'GET', body = null, auth = false, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  // Si mando body, lo convierto a JSON
  if (body != null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  // Si auth es true, añado el header Authorization con el token
  if (auth) {
    const token = getToken();
    if (token) init.headers['Authorization'] = `Bearer ${token}`;
  }
  // Uso la constante global API_BASE para construir la URL
  const res = await fetch(`${API_BASE}${path}`, init);
  const ct = res.headers.get('content-type') || '';
  // Si la respuesta es JSON, la parseo, si no, la dejo como texto
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    // Si hay error, intento sacar el mensaje del objeto de error
    const msg = typeof data === 'object' && data && data.error ? data.error : res.statusText;
    throw new Error(msg);
  }
  return data;
}

// Objeto con helpers específicos para distintas rutas de la API
export const api = {
  // Listar categorías
  categories: () => request('/api/categories'),
  // Listar productos con filtros opcionales
  products: (params = {}) => request('/api/products?' + new URLSearchParams(params).toString()),
  // Registrar usuario nuevo
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  // Login de usuario
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  // Obtener perfil del usuario logueado
  me: () => request('/api/auth/me', { auth: true }),
  // Rutas relacionadas con wishlist
  wishlist: {
    list: () => request('/api/wishlist', { auth: true }),
    add:  (id) => request(`/api/wishlist/${id}`, { method: 'POST', auth: true }),
    remove: (id) => request(`/api/wishlist/${id}`, { method: 'DELETE', auth: true }),
  }
};
