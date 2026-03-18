import { create } from 'zustand/react';
import { loadItems, saveItems, loadGenres, saveGenres, loadImportant, saveImportant, loadTheme, saveTheme, loadLayout } from '../utils/storage';

const DEFAULT_GENRES = ['ゲーム','映画','小説','マンガ','アニメ','音楽','心情','その他'];
const DEFAULT_GENRE_COLORS = {
  'ゲーム':'#2a6e8c','映画':'#c94a2a','小説':'#5a7a3a','マンガ':'#8c5a2a',
  'アニメ':'#6a2a8c','音楽':'#1a7a6a','心情':'#8c3a6a','その他':'#555'
};

export const useStore = create((set, get) => ({
  // --- データ ---
  items: loadItems(),
  customGenres: loadGenres(),
  importantIds: loadImportant(),
  theme: loadTheme(),

  // --- UI状態 ---
  currentFilter: new Set(),
  currentTagFilter: null,
  currentStarFilter: 0,
  currentView: 'grid',        // 'grid' | 'timeline'
  currentLayout: loadLayout(), // 'normal' | 'compact'
  currentSort: 'default',
  tlMode: 'normal',           // 'normal' | 'important'
  tlLayout: 'normal',         // 'normal' | 'zigzag'
  selectMode: false,
  selectedIds: new Set(),
  modalOpen: false,
  editingId: null,
  mobileMenuOpen: false,
  tagDropdownOpen: false,

  // --- アイテム操作 ---
  setItems: (items) => {
    saveItems(items);
    set({ items });
  },
  addItem: (item) => {
    const items = [...get().items, item];
    saveItems(items);
    set({ items });
  },
  updateItem: (id, updated) => {
    const items = get().items.map(x => String(x.id) === String(id) ? { ...x, ...updated } : x);
    saveItems(items);
    set({ items });
  },
  deleteItem: (id) => {
    const items = get().items.filter(x => String(x.id) !== String(id));
    saveItems(items);
    set({ items });
  },

  // --- ジャンル ---
  getAllGenres: () => {
    const { customGenres } = get();
    return DEFAULT_GENRES.concat(customGenres);
  },
  addGenre: (name, color) => {
    const { customGenres, getAllGenres } = get();
    if (!name || getAllGenres().some(g => (typeof g === 'string' ? g : g.name) === name)) return false;
    const updated = [...customGenres, { name, color: color || '#888' }];
    saveGenres(updated);
    set({ customGenres: updated });
    return true;
  },
  genreDefaultColor: (g) => {
    if (DEFAULT_GENRE_COLORS[g]) return DEFAULT_GENRE_COLORS[g];
    const cg = get().customGenres.find(x => x.name === g);
    return cg ? cg.color : '#888';
  },

  // --- 重要フラグ ---
  toggleImportant: (id) => {
    const importantIds = { ...get().importantIds };
    const sid = String(id);
    if (importantIds[sid]) delete importantIds[sid];
    else importantIds[sid] = true;
    saveImportant(importantIds);
    set({ importantIds });
  },
  setImportantIds: (ids) => {
    saveImportant(ids);
    set({ importantIds: ids });
  },

  // --- フィルター ---
  toggleGenreFilter: (genre) => {
    const f = new Set(get().currentFilter);
    if (f.has(genre)) f.delete(genre); else f.add(genre);
    set({ currentFilter: f });
  },
  clearGenreFilter: () => set({ currentFilter: new Set() }),
  setTagFilter: (tag) => set({ currentTagFilter: tag }),
  setStarFilter: (n) => set({ currentStarFilter: n }),
  setSort: (s) => set({ currentSort: s }),

  // --- ビュー ---
  setView: (v) => set({ currentView: v }),
  setLayout: (l) => {
    localStorage.setItem('sakuhin-layout', l);
    set({ currentLayout: l });
  },
  setTlMode: (m) => set({ tlMode: m }),
  setTlLayout: (l) => set({ tlLayout: l }),

  // --- 選択モード ---
  enterSelectMode: () => set({ selectMode: true, selectedIds: new Set() }),
  exitSelectMode: () => set({ selectMode: false, selectedIds: new Set() }),
  toggleSelect: (id) => {
    const s = new Set(get().selectedIds);
    const sid = String(id);
    if (s.has(sid)) s.delete(sid); else s.add(sid);
    set({ selectedIds: s });
  },
  selectAll: (ids) => set({ selectedIds: new Set(ids.map(String)) }),

  // --- モーダル ---
  openModal: (id = null) => set({ modalOpen: true, editingId: id }),
  closeModal: () => set({ modalOpen: false, editingId: null }),

  // --- テーマ ---
  setTheme: (theme) => {
    saveTheme(theme);
    set({ theme });
  },

  // --- モバイルメニュー ---
  setMobileMenuOpen: (v) => set({ mobileMenuOpen: v }),
  setTagDropdownOpen: (v) => set({ tagDropdownOpen: v }),

  // --- ユーティリティ ---
  getFiltered: () => {
    const { items, currentFilter, currentTagFilter, currentStarFilter } = get();
    let result = currentFilter.size === 0 ? items.slice() : items.filter(x => currentFilter.has(x.genre));
    if (currentTagFilter) result = result.filter(x => (x.tags || []).includes(currentTagFilter));
    if (currentStarFilter > 0) result = result.filter(x => (x.stars || 0) >= currentStarFilter);
    return result;
  },
  getSorted: (arr) => {
    const { currentSort } = get();
    const copy = [...arr];
    if (currentSort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    else if (currentSort === 'lastdate') copy.sort((a, b) => {
      const da = getLastDateUtil(a), db = getLastDateUtil(b);
      return da < db ? 1 : da > db ? -1 : 0;
    });
    else if (currentSort === 'stars_desc') copy.sort((a, b) => (b.stars||0) - (a.stars||0));
    else if (currentSort === 'stars_asc') copy.sort((a, b) => (a.stars||0) - (b.stars||0));
    return copy;
  },
}));

export { DEFAULT_GENRES, DEFAULT_GENRE_COLORS };

// ユーティリティ（ストア外でも使う）
export function normDate(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}$/.test(v)) return v + '-01';
  return v;
}
export function getItemDates(item) {
  if (item.dates && item.dates.length) return item.dates;
  if (item.dateStart || item.dateEnd) return [{ start: item.dateStart||'', end: item.dateEnd||'', mode:'day' }];
  return [];
}
export function getLastDateUtil(item) {
  const dates = getItemDates(item);
  let last = '';
  dates.forEach(d => {
    const e = normDate(d.end), s = normDate(d.start);
    if (e && e > last) last = e;
    if (s && s > last) last = s;
  });
  return last;
}
export function getFirstDateUtil(item) {
  const dates = getItemDates(item);
  let first = '';
  for (const d of dates) {
    const s = normDate(d.start);
    if (s && (!first || s < first)) first = s;
  }
  return first;
}
