// localStorage キー
const KEYS = {
  ITEMS: 'sakuhin-log',
  GENRES: 'sakuhin-genres',
  IMPORTANT: 'sakuhin-important',
  THEME: 'sakuhin-theme',
  LAYOUT: 'sakuhin-layout',
};

const DEFAULT_THEME = {
  bg: '#f5f0e8', surface: '#fdfaf4', surface2: '#ede8dc',
  ink: '#1a1612', ink2: '#5a5248', ink3: '#9a9088',
  accent: '#c94a2a', accent2: '#2a6e8c',
  border: '#d0c8b8',
};

function parse(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export const loadItems = () => parse(KEYS.ITEMS, []);
export const saveItems = (items) => { try { localStorage.setItem(KEYS.ITEMS, JSON.stringify(items)); } catch {} };

export const loadGenres = () => parse(KEYS.GENRES, []);
export const saveGenres = (genres) => { try { localStorage.setItem(KEYS.GENRES, JSON.stringify(genres)); } catch {} };

export const loadImportant = () => parse(KEYS.IMPORTANT, {});
export const saveImportant = (ids) => { try { localStorage.setItem(KEYS.IMPORTANT, JSON.stringify(ids)); } catch {} };

export const loadTheme = () => ({ ...DEFAULT_THEME, ...parse(KEYS.THEME, {}) });
export const saveTheme = (theme) => { try { localStorage.setItem(KEYS.THEME, JSON.stringify(theme)); } catch {} };

export const loadLayout = () => localStorage.getItem(KEYS.LAYOUT) || 'normal';

export { DEFAULT_THEME };
