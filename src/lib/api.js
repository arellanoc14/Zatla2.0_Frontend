// Base URL for the Zatla 2.0 backend (shares, orders, QuickBooks). Set
// VITE_API_URL before building; it is baked into the bundle.
export const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001';

export const apiUrl = (path) => `${API_URL}${path}`;
