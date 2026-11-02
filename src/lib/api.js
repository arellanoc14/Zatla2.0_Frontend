// Base URL of the API (shares, orders). Set
// VITE_API_URL before building; it is baked into the bundle.
export const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001';

export const apiUrl = (path) => `${API_URL}${path}`;
