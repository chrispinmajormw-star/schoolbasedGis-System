// Per-device display preferences (kept in this browser only).
const KEY = 'safecom.prefs';

export const DEFAULT_PREFS = {
  basemap: 'standard',      // 'standard' | 'humanitarian'
  colourBy: 'spi',          // 'spi' | 'risk'
  showFlood: true,
  sizeByPeople: true,
  showList: true,           // facilities panel open on start
  sidebarCollapsed: false,
  autoRefresh: true,
};

export function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: keep defaults */ }
  return next;
}
