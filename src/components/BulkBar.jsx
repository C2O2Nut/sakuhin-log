import { useStore } from '../store/useStore';
import { showToast } from './Toast';

export default function BulkBar() {
  const {
    selectMode, selectedIds, items, importantIds,
    updateItem, setImportantIds, exitSelectMode,
    getFiltered, getSorted, selectAll, getAllGenres,
  } = useStore();

  if (!selectMode) return null;

  const count = selectedIds.size;
  const filtered = getSorted(getFiltered());
  const genres = getAllGenres().map(g => typeof g === 'string' ? g : g.name);

  const handleSelectAll = () => {
    if (count === filtered.length) selectAll([]);
    else selectAll(filtered.map(x => x.id));
  };

  const handleImportant = () => {
    const ids = { ...importantIds };
    const allImportant = [...selectedIds].every(id => ids[id]);
    [...selectedIds].forEach(id => {
      if (allImportant) delete ids[id]; else ids[id] = true;
    });
    useStore.getState().setImportantIds(ids);
    showToast(`重要を${allImportant ? '解除' : '設定'}しました`);
  };

  const handleColor = () => {
    const input = document.createElement('input');
    input.type = 'color'; input.value = '#2a6e8c';
    input.onchange = () => {
      [...selectedIds].forEach(id => updateItem(id, { color: input.value }));
      showToast('カラーを変更しました');
    };
    input.click();
  };

  const handleGenre = () => {
    const genre = window.prompt('ジャンルを入力:\n' + genres.join(', '));
    if (!genre || !genres.includes(genre)) return;
    [...selectedIds].forEach(id => updateItem(id, { genre }));
    showToast('ジャンルを変更しました');
  };

  const handleStar = () => {
    const s = window.prompt('星評価（0〜3）:');
    const n = parseInt(s);
    if (isNaN(n) || n < 0 || n > 3) return;
    [...selectedIds].forEach(id => updateItem(id, { stars: n }));
    showToast('星評価を変更しました');
  };

  const Btn = ({ onClick, children }) => (
    <button onClick={onClick} style={{
      padding:'6px 12px', border:'1.5px solid var(--border)', borderRadius:4,
      background:'var(--surface)', fontFamily:"'Noto Sans JP',sans-serif", fontSize:12,
      color:'var(--ink2)', cursor:'pointer',
    }}>{children}</button>
  );

  return (
    <div style={{
      position:'sticky', top:52, zIndex:90, background:'var(--surface2)',
      borderBottom:'2px solid var(--accent2)', padding:'8px 16px',
      display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
    }}>
      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:'var(--ink2)', flexShrink:0 }}>
        {count} 件選択中
      </span>
      <Btn onClick={handleSelectAll}>{count === filtered.length ? '全解除' : '全選択'}</Btn>
      <Btn onClick={handleImportant}>重要</Btn>
      <Btn onClick={handleColor}>カラー変更</Btn>
      <Btn onClick={handleGenre}>ジャンル変更</Btn>
      <Btn onClick={handleStar}>星変更</Btn>
      <button onClick={exitSelectMode} style={{
        marginLeft:'auto', padding:'6px 12px', background:'var(--accent)',
        color:'#fff', border:'none', borderRadius:4,
        fontFamily:"'Noto Sans JP',sans-serif", fontSize:12, cursor:'pointer',
      }}>キャンセル</button>
    </div>
  );
}
