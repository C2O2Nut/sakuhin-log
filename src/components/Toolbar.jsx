import { useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';

export default function Toolbar() {
  const {
    items, currentFilter, currentTagFilter, currentStarFilter,
    currentView, currentLayout, currentSort,
    tlMode, tlLayout,
    selectMode, mobileMenuOpen,
    getAllGenres, genreDefaultColor,
    toggleGenreFilter, clearGenreFilter, setTagFilter, setStarFilter, setSort,
    setView, setLayout, setTlMode, setTlLayout,
    enterSelectMode, exitSelectMode,
    openModal, setMobileMenuOpen,
    tagDropdownOpen, setTagDropdownOpen,
  } = useStore();

  const tagBtnRef = useRef(null);
  const tagDropRef = useRef(null);
  const genres = getAllGenres();

  // タグドロップダウン外クリックで閉じる
  useEffect(() => {
    const handler = (e) => {
      if (!tagDropRef.current?.contains(e.target) && !tagBtnRef.current?.contains(e.target)) {
        setTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 全タグ収集
  const allTags = [...new Set(items.flatMap(x => x.tags || []))];

  const starLabel = currentStarFilter === 0 ? '★' : currentStarFilter === 1 ? '★☆☆' : currentStarFilter === 2 ? '★★☆' : '★★★';

  const Btn = ({ active, onClick, children, color, title }) => (
    <button title={title} onClick={onClick} style={{
      padding:'5px 12px', border:'1.5px solid var(--border)', borderRadius:20,
      fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, cursor:'pointer',
      background: active ? (color || 'var(--ink)') : 'transparent',
      color: active ? '#fff' : 'var(--ink2)',
      borderColor: active ? (color || 'var(--ink)') : 'var(--border)',
      transition:'all 0.15s', flexShrink:0,
    }}>{children}</button>
  );

  const ViewBtn = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
      padding:'0 12px', height:34, border:'1.5px solid var(--border)', borderRadius:4,
      fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, cursor:'pointer',
      background: active ? 'var(--ink2)' : 'transparent',
      color: active ? '#fff' : 'var(--ink2)',
      borderColor: active ? 'var(--ink2)' : 'var(--border)',
      transition:'all 0.15s', flexShrink:0, whiteSpace:'nowrap',
    }}>{children}</button>
  );

  const RightButtons = () => (
    <>
      {/* レイアウトグループ */}
      <div style={{ display:'flex', gap:4 }}>
        <ViewBtn active={currentLayout==='normal'} onClick={() => setLayout('normal')}>▦</ViewBtn>
        <ViewBtn active={currentLayout==='compact'} onClick={() => setLayout('compact')}>⊞</ViewBtn>
      </div>
      {/* ビュー切替グループ */}
      <div style={{ display:'flex', gap:4 }}>
        <ViewBtn active={currentView==='grid'} onClick={() => setView('grid')}>カード</ViewBtn>
        <ViewBtn active={currentView==='timeline'} onClick={() => setView('timeline')}>年表</ViewBtn>
      </div>
      {/* 年表オプション（年表時のみ） */}
      {currentView === 'timeline' && (
        <div style={{ display:'flex', gap:4 }}>
          <ViewBtn active={tlMode==='normal'} onClick={() => setTlMode('normal')}>通常</ViewBtn>
          <ViewBtn active={tlMode==='important'} onClick={() => setTlMode('important')}>重要</ViewBtn>
          <ViewBtn active={tlLayout==='normal'} onClick={() => setTlLayout('normal')}>|||</ViewBtn>
          <ViewBtn active={tlLayout==='zigzag'} onClick={() => setTlLayout('zigzag')}>⇌</ViewBtn>
        </div>
      )}
      {/* 並び替え */}
      <select value={currentSort} onChange={e => setSort(e.target.value)} style={{
        height:34, border:'1.5px solid var(--border)', borderRadius:4, background:'var(--surface)',
        fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, color:'var(--ink2)', cursor:'pointer', padding:'0 8px',
      }}>
        <option value="default">登録順</option>
        <option value="name">名前順</option>
        <option value="lastdate">最終日順</option>
        <option value="stars_desc">★が高い順</option>
        <option value="stars_asc">★が低い順</option>
      </select>
      {/* 選択モード */}
      <ViewBtn active={selectMode} onClick={selectMode ? exitSelectMode : enterSelectMode}>
        {selectMode ? '選択中' : '選択'}
      </ViewBtn>
      {/* 追加 */}
      <button onClick={() => openModal(null)} style={{
        padding:'7px 18px', background:'var(--accent)', color:'#fff', border:'none',
        borderRadius:4, fontFamily:"'Noto Sans JP',sans-serif", fontSize:13,
        fontWeight:500, cursor:'pointer', height:34, whiteSpace:'nowrap', flexShrink:0,
      }}>＋ 追加</button>
    </>
  );

  return (
    <div style={{
      padding:'0 12px', display:'flex', gap:0, alignItems:'center',
      background:'var(--surface)', borderBottom:'1px solid var(--border)',
      height:52, overflow:'visible', position:'relative',
    }}>
      {/* ジャンルフィルター横スクロール */}
      <div style={{
        display:'flex', gap:6, alignItems:'center',
        flex:1, overflowX:'auto', overflowY:'hidden',
        padding:'8px 6px 8px 0', minWidth:0,
        scrollbarWidth:'none',
      }}>
        <Btn active={currentFilter.size === 0} onClick={clearGenreFilter}>すべて</Btn>
        {genres.map(g => {
          const name = typeof g === 'string' ? g : g.name;
          const color = genreDefaultColor(name);
          return (
            <Btn key={name} active={currentFilter.has(name)} color={color}
              onClick={() => toggleGenreFilter(name)}>{name}</Btn>
          );
        })}
        {/* タグフィルター */}
        <div style={{ position:'relative', flexShrink:0 }}>
          <Btn ref={tagBtnRef} active={!!currentTagFilter} onClick={() => setTagDropdownOpen(!tagDropdownOpen)}>
            {currentTagFilter ? '#' + currentTagFilter : 'タグ'}
          </Btn>
          {tagDropdownOpen && (
            <div ref={tagDropRef} style={{
              position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:200,
              background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:6, boxShadow:'0 8px 24px var(--shadow)',
              minWidth:160, maxHeight:260, overflowY:'auto', padding:'6px 0',
            }}>
              {currentTagFilter && (
                <button onClick={() => { setTagFilter(null); setTagDropdownOpen(false); }} style={tagItemStyle}>
                  絞り込みを解除
                </button>
              )}
              {allTags.length === 0 && (
                <div style={{ padding:'8px 16px', fontSize:12, color:'var(--ink3)' }}>タグがありません</div>
              )}
              {allTags.map(tag => (
                <button key={tag} onClick={() => { setTagFilter(tag); setTagDropdownOpen(false); }}
                  style={{ ...tagItemStyle, fontWeight: currentTagFilter === tag ? 700 : 400 }}>
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 星フィルター */}
        <Btn active={currentStarFilter > 0}
          onClick={() => setStarFilter((currentStarFilter + 1) % 4)}>
          {starLabel}
        </Btn>
      </div>

      {/* 右側ボタン群（PC） */}
      <div style={{
        display:'flex', gap:6, alignItems:'center', flexShrink:0,
        paddingLeft:8, borderLeft:'1px solid var(--border)', marginLeft:4, height:'100%',
      }} className="toolbar-right-pc">
        <RightButtons />
      </div>

      {/* スマホ用「…」ボタン */}
      <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="toolbar-more-btn" style={{
        display:'none', padding:'0 11px', height:34, flexShrink:0,
        background:'var(--surface2)', border:'1.5px solid var(--border)',
        borderRadius:4, cursor:'pointer', fontSize:18, color:'var(--ink2)',
        marginLeft:8,
      }}>…</button>

      {/* スマホ用ドロップダウン */}
      {mobileMenuOpen && (
        <div style={{
          position:'fixed', top:52, right:0, left:0, zIndex:150,
          background:'var(--surface)', borderBottom:'2px solid var(--border)',
          padding:'12px 16px', display:'flex', flexDirection:'column', gap:10,
          boxShadow:'0 8px 24px var(--shadow)',
        }}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
            <RightButtons />
          </div>
        </div>
      )}

      {/* CSS for responsive */}
      <style>{`
        @media (max-width: 700px) {
          .toolbar-right-pc { display: none !important; }
          .toolbar-more-btn { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

const tagItemStyle = {
  display:'block', width:'100%', textAlign:'left', padding:'7px 16px',
  background:'transparent', border:'none', cursor:'pointer',
  fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, color:'var(--ink)',
};
