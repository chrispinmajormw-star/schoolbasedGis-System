import { supabase } from './supabase.js';

const BASE = import.meta.env.VITE_API_URL || '/api';

async function authHeader() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { ...(await authHeader()) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('Cannot reach the server. Check your internet connection (the server may take up to a minute to wake up).');
  }
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new Error(`Unexpected response from the server (${res.status}). Is VITE_API_URL set correctly?`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  facilities: () => request('/facilities'),
  hazards: () => request('/hazards'),
  checklists: () => request('/checklists'),
  summary: () => request('/summary'),
  lastAssessment: (id) => request(`/facilities/${id}/assessment`),
  history: (id) => request(`/facilities/${id}/history`),
  saveAssessment: (id, data) => request(`/facilities/${id}/assessments`, { method: 'POST', body: data }),
  register: (data) => request('/register', { method: 'POST', body: data }),
  me: () => request('/me'),
  updateMe: (data) => request('/me', { method: 'PATCH', body: data }),
  updateFacility: (id, data) => request(`/facilities/${id}`, { method: 'PATCH', body: data }),
  uploadPhoto: (id, dataUrl) => request(`/facilities/${id}/photo`, { method: 'POST', body: { dataUrl } }),
  createFacility: (data) => request('/facilities', { method: 'POST', body: data }),
  deleteFacility: (id) => request(`/facilities/${id}`, { method: 'DELETE' }),
  users: () => request('/users'),
  createUser: (data) => request('/users', { method: 'POST', body: data }),
  approveUser: (id, facilityId) => request(`/users/${id}/approve`, { method: 'POST', body: { facility_id: facilityId || undefined } }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PATCH', body: data }),
  setPassword: (id, password) => request(`/users/${id}`, { method: 'PATCH', body: { password } }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  activity: () => request('/activity'),
  // decision support
  answers: () => request('/answers'),
  trend: (district) => request(`/trend${district && district !== 'all' ? `?district=${encodeURIComponent(district)}` : ''}`),
  updateCosts: (items) => request('/indicator-costs', { method: 'PATCH', body: { items } }),
  adminAreas: (level = 'district') => request(`/admin-areas?level=${level}`),
  adminAreasSummary: () => request('/admin-areas/summary'),
  uploadAdminAreas: (data) => request('/admin-areas', { method: 'POST', body: data }),
  deleteAdminAreas: (level) => request(`/admin-areas?level=${level}`, { method: 'DELETE' }),
  importStatus: () => request('/import/status'),
  removeSample: () => request('/import/sample', { method: 'DELETE' }),
  importFacilities: (items, autoDistrict) => request('/import/facilities', { method: 'POST', body: { items, auto_district: autoDistrict } }),
  importFloodZones: (body) => request('/import/flood-zones', { method: 'POST', body }),
  importRoads: (body) => request('/import/roads', { method: 'POST', body }),
  deleteRoads: () => request('/import/roads', { method: 'DELETE' }),
  recalcDistances: () => request('/import/distances', { method: 'POST' }),
  floodReports: (years) => request(`/flood-reports${years ? `?years=${years}` : ''}`),
  allFloodReports: () => request('/flood-reports/all'),
  reportFlood: (data) => request('/flood-reports', { method: 'POST', body: data }),
  reviewReport: (id, status) => request(`/flood-reports/${id}`, { method: 'PATCH', body: { status } }),
  deleteReport: (id) => request(`/flood-reports/${id}`, { method: 'DELETE' }),
  actions: () => request('/actions'),
  createActions: (items) => request('/actions', { method: 'POST', body: { items } }),
  updateAction: (id, data) => request(`/actions/${id}`, { method: 'PATCH', body: data }),
  deleteAction: (id) => request(`/actions/${id}`, { method: 'DELETE' }),
  exportUrl: `${BASE}/export.csv`,
};

export const CLASS_STYLE = {
  high: { color: '#16a34a', bg: '#dcfce7', text: '#166534', label: 'High', range: '80–100' },
  moderate: { color: '#eab308', bg: '#fef9c3', text: '#854d0e', label: 'Moderate', range: '60–79' },
  low: { color: '#dc2626', bg: '#fee2e2', text: '#991b1b', label: 'Low', range: '< 60' },
  unassessed: { color: '#9ca3af', bg: '#f3f4f6', text: '#4b5563', label: 'Not assessed', range: '' },
};

export const FLOOD_STYLE = {
  1: { color: '#93c5fd', label: 'Low' },
  2: { color: '#3b82f6', label: 'Medium' },
  3: { color: '#1d4ed8', label: 'High' },
};

export function rpsColor(rps) {
  if (rps === null || rps === undefined) return '#9ca3af';
  if (rps >= 15) return '#7f1d1d';
  if (rps >= 5) return '#dc2626';
  if (rps > 0) return '#f59e0b';
  return '#16a34a';
}

// Same formula as the database: SPI = 100 * sum(w * score) / sum(w)
export function computeSpi(weights, values) {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (!total) return 0;
  const got = weights.reduce((s, w) => {
    const v = values[w.indicator];
    const score = w.kind === 'percent' ? (Number(v) || 0) / 100 : v ? 1 : 0;
    return s + w.weight * score;
  }, 0);
  return Math.round((1000 * got) / total) / 10;
}

export function classify(spi) {
  if (spi === null || spi === undefined) return 'unassessed';
  return spi >= 80 ? 'high' : spi >= 60 ? 'moderate' : 'low';
}

// An assessment older than this needs repeating.
export const STALE_DAYS = 180;
export const needsAssessment = (p) => !p.assessed_on || (Date.now() - new Date(p.assessed_on)) / 864e5 > STALE_DAYS;

export function timeAgo(d) {
  if (!d) return '—';
  const s = Math.max(0, (Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(d);
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtKm = (m) => (m === null || m === undefined ? '—' : `${(m / 1000).toFixed(1)} km`);

// Resize an image file in the browser to keep uploads small on mobile data.
export function resizeImage(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}
