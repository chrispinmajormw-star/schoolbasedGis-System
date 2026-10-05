const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  schools: () => request('/schools'),
  hazards: () => request('/hazards'),
  weights: () => request('/weights'),
  summary: () => request('/summary'),
  lastAssessment: (id) => request(`/schools/${id}/assessment`),
  history: (id) => request(`/schools/${id}/history`),
  saveAssessment: (id, data) =>
    request(`/schools/${id}/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  exportUrl: `${BASE}/export.csv`,
};

export const CLASS_STYLE = {
  high: { color: '#16a34a', label: 'Higher (80-100)' },
  moderate: { color: '#eab308', label: 'Moderate (60-79)' },
  low: { color: '#dc2626', label: 'Lower (<60)' },
  unassessed: { color: '#9ca3af', label: 'Not assessed' },
};

export const FLOOD_STYLE = {
  1: { color: '#93c5fd', label: 'Low' },
  2: { color: '#3b82f6', label: 'Medium' },
  3: { color: '#1d4ed8', label: 'High' },
};

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
