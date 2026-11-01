// Base URL for the Zatla 2.0 backend. Existing calls don't use this yet.
export const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001';

export const apiUrl = (path) => `${API_URL}${path}`;
