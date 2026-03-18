import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { applyTheme } from './utils/theme';
import Header from './components/Header';
import Toolbar from './components/Toolbar';
import CardGrid from './components/CardGrid';
import Timeline from './components/Timeline';
import ItemModal from './components/ItemModal';
import Toast from './components/Toast';

export default function App() {
  const { currentView, items, theme, mobileMenuOpen, setMobileMenuOpen } = useStore();

  // テーマ適用
  useEffect(() => { applyTheme(theme); }, [theme]);

  // モバイルメニュー：外クリックで閉じる（開いているときだけリスナーを登録）
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = () => setMobileMenuOpen(false);
    const t = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', handler); };
  }, [mobileMenuOpen]);

  return (
    <>
      <Header />
      <Toolbar />

      {/* カウントバー */}
      <div style={{
        padding:'7px 24px', fontFamily:"'DM Mono',monospace", fontSize:11,
        color:'var(--ink3)', background:'var(--surface2)', borderBottom:'1px solid var(--border)',
      }}>
        {items.length} 件
      </div>

      {/* メインコンテンツ */}
      <main>
        {currentView === 'grid' ? <CardGrid /> : <Timeline />}
      </main>

      {/* モーダル・トースト */}
      <ItemModal />
      <Toast />

      {/* バージョン */}
      <div style={{
        position:'fixed', bottom:8, left:12, fontSize:10,
        color:'var(--ink3)', opacity:0.5, fontFamily:"'DM Mono',monospace",
        pointerEvents:'none', zIndex:1,
      }}>v2.0.0</div>

      {/* グローバルCSS */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Noto Sans JP', sans-serif;
          background: var(--bg);
          color: var(--ink);
          min-height: 100vh;
        }
        input, select, textarea, button {
          font-family: inherit;
        }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: var(--accent2) !important;
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: var(--surface2); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
      `}</style>
    </>
  );
}
