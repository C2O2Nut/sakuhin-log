import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { showToast } from './Toast';
import { driveSave, driveLoad, driveLogin, driveLogout, isDriveLoggedIn, initGoogleAuth } from '../utils/drive';
import { loadItems, saveItems } from '../utils/storage';
import { PRESETS, applyTheme } from '../utils/theme';

export default function Header() {
  const { items, setItems, theme, setTheme } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [driveLoggedIn, setDriveLoggedIn] = useState(isDriveLoggedIn());
  const [themeOpen, setThemeOpen] = useState(false);
  const [localTheme, setLocalTheme] = useState(theme);
  const menuRef = useRef(null);

  useEffect(() => {
    initGoogleAuth((status, msg) => {
      if (status === 'loggedIn') setDriveLoggedIn(true);
      if (status === 'loggedOut') setDriveLoggedIn(false);
      if (status === 'error') showToast('Drive: ' + msg, 'error');
    });
  }, []);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'sakuhin-log.json'; a.click();
    showToast('エクスポートしました');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!Array.isArray(data)) throw new Error();
          setItems(data);
          showToast(`${data.length} 件インポートしました`);
        } catch { showToast('JSONの形式が不正です', 'error'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleBookmoryImport = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.bookmory,.zip';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showToast('読み込み中…');
      try {
        const { importBookmory, mergeItems } = await import('../utils/importers');
        const buf = await file.arrayBuffer();
        const newItems = await importBookmory(buf);
        const { result, added, updated } = mergeItems(items, newItems);
        setItems(result);
        showToast(`bookmory: ${added}件追加・${updated}件更新`);
      } catch (e) { showToast('インポート失敗: ' + e.message, 'error'); }
    };
    input.click();
  };

  const handleDriveSave = async () => {
    showToast('Driveに保存中…');
    await driveSave(items, (status, msg) => {
      if (status === 'saved') showToast('Driveに保存しました');
      else if (status === 'error') showToast('保存失敗: ' + msg, 'error');
    });
  };

  const handleDriveLoad = async () => {
    showToast('Driveから読み込み中…');
    const data = await driveLoad((status, msg) => {
      if (status === 'notFound') showToast('Driveにデータが見つかりません', 'error');
      else if (status === 'error') showToast('読み込み失敗: ' + msg, 'error');
    });
    if (data && Array.isArray(data)) {
      setItems(data);
      showToast(`${data.length} 件読み込みました`);
    }
  };

  const handleThemeApply = () => {
    applyTheme(localTheme);
    setTheme(localTheme);
    showToast('テーマを適用しました');
    setThemeOpen(false);
  };

  return (
    <>
      <header style={{
        background:'var(--ink)', padding:'14px 24px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:100, borderBottom:'3px solid var(--accent)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <h1 style={{ fontFamily:"'Noto Serif JP', serif", color:'var(--bg)', fontSize:20, letterSpacing:'0.1em' }}>
            作品ログ
          </h1>
          <span style={{ fontFamily:"'DM Mono', monospace", color:'var(--ink3)', fontSize:12 }}>
            v2.0.0
          </span>
        </div>

        <div style={{ position:'relative' }} ref={menuRef}>
          <button onClick={() => setMenuOpen(v => !v)} style={{
            background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)',
            color:'var(--bg)', borderRadius:4, padding:'6px 14px', cursor:'pointer',
            fontFamily:"'Noto Sans JP', sans-serif", fontSize:13,
          }}>データ</button>

          {menuOpen && (
            <div style={{
              position:'absolute', right:0, top:'calc(100% + 6px)', background:'var(--surface)',
              border:'1px solid var(--border)', borderRadius:6, boxShadow:'0 8px 24px var(--shadow)',
              zIndex:200, minWidth:200, overflow:'hidden',
            }}>
              {/* Drive連携 */}
              <div style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <MenuLabel>Google Drive</MenuLabel>
                {driveLoggedIn ? (
                  <>
                    <MenuItem onClick={handleDriveSave}>Driveに保存</MenuItem>
                    <MenuItem onClick={handleDriveLoad}>Driveから読み込む</MenuItem>
                    <MenuItem onClick={() => driveLogout((s) => { if(s==='loggedOut') { setDriveLoggedIn(false); showToast('ログアウトしました'); }})}>ログアウト</MenuItem>
                  </>
                ) : (
                  <MenuItem onClick={() => driveLogin((s,m) => { if(s==='loggedIn'){setDriveLoggedIn(true);showToast('ログインしました');} if(s==='error')showToast(m,'error'); })}>
                    Googleアカウントでログイン
                  </MenuItem>
                )}
              </div>
              {/* インポート/エクスポート */}
              <div style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <MenuLabel>インポート / エクスポート</MenuLabel>
                <MenuItem onClick={handleExport}>JSONでエクスポート</MenuItem>
                <MenuItem onClick={handleImport}>JSONからインポート</MenuItem>
                <MenuItem onClick={handleBookmoryImport}>bookmoryからインポート</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); document.getElementById('steam-modal-trigger')?.click(); }}>
                  Steamからインポート
                </MenuItem>
              </div>
              {/* テーマ */}
              <div style={{ padding:'8px 0' }}>
                <MenuItem onClick={() => { setMenuOpen(false); setThemeOpen(true); }}>テーマ・色を変える</MenuItem>
              </div>
              {/* バージョン */}
              <div style={{ padding:'6px 16px', fontSize:11, color:'var(--ink3)', textAlign:'right', borderTop:'1px solid var(--border)' }}>
                v2.0.0
              </div>
            </div>
          )}
        </div>
      </header>

      {/* テーマモーダル */}
      {themeOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setThemeOpen(false)}>
          <div style={{ background:'var(--surface)', borderRadius:8, padding:24, width:480, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily:"'Noto Serif JP',serif", marginBottom:16, fontSize:16 }}>テーマ設定</h2>
            {/* プリセット */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
              {Object.keys(PRESETS).map(name => (
                <button key={name} onClick={() => setLocalTheme(PRESETS[name])} style={{
                  padding:'5px 12px', border:'1.5px solid var(--border)', borderRadius:4,
                  background:'transparent', cursor:'pointer', fontSize:13, fontFamily:"'Noto Sans JP',sans-serif",
                }}>{name}</button>
              ))}
            </div>
            {/* カラーピッカー */}
            {[
              ['bg','背景色'],['surface','カード色'],['ink','文字色'],
              ['accent','アクセント色'],['ink','ヘッダー色'],['border','ボーダー色'],
            ].map(([key, label]) => (
              <div key={key+label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <label style={{ fontSize:13, color:'var(--ink2)' }}>{label}</label>
                <input type="color" value={localTheme[key] || '#000000'}
                  onChange={e => setLocalTheme(t => ({ ...t, [key]: e.target.value }))}
                  style={{ height:36, width:48, padding:2, border:'1.5px solid var(--border)', borderRadius:4, cursor:'pointer' }} />
              </div>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setThemeOpen(false)} style={{ padding:'8px 16px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:4, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13 }}>キャンセル</button>
              <button onClick={handleThemeApply} style={{ padding:'8px 16px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13 }}>適用</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      display:'block', width:'100%', textAlign:'left', padding:'8px 16px',
      background:'transparent', border:'none', cursor:'pointer',
      fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, color:'var(--ink)',
    }}
    onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
    onMouseLeave={e => e.currentTarget.style.background='transparent'}
    >{children}</button>
  );
}

function MenuLabel({ children }) {
  return <div style={{ padding:'4px 16px', fontSize:11, color:'var(--ink3)', fontFamily:"'DM Mono',monospace" }}>{children}</div>;
}
