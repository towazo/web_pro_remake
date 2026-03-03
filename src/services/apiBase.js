export const resolveApiBase = () => {
  const raw = String(import.meta.env?.VITE_API_BASE_URL || '/api').trim();
  if (!raw) return '/api';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

export const API_BASE = resolveApiBase();

export const joinApiPath = (path) => `${API_BASE}${path}`;
