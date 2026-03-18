import { useStore } from '../store/useStore';
import { getItemDates } from '../store/useStore';

export function starsHTML(n) {
  return Array.from({ length: 3 }, (_, i) => (
    <span key={i} style={{ color: i < n ? '#d4920a' : 'var(--border)' }}>{i < n ? '★' : '☆'}</span>
  ));
}

export default function CardItem({ item, compact }) {
  const { selectMode, selectedIds, toggleSelect, openModal, genreDefaultColor, importantIds } = useStore();
  const selected = selectedIds.has(String(item.id));
  const isImportant = importantIds[String(item.id)];

  const dates = getItemDates(item);
  const status = item.status || '完了';
  const color = genreDefaultColor(item.genre);
  const typeStr = item.type ? ' / ' + item.type : '';

  const handleClick = () => {
    if (selectMode) toggleSelect(item.id);
    else openModal(item.id);
  };

  const statusColors = { 完了:'#5a9a4a', 進行中:'#e8a020', 未着手:'#aaa' };

  return (
    <div
      data-id={String(item.id)}
      onClick={handleClick}
      style={{
        background:'var(--surface)', border:`1px solid ${selected ? 'var(--accent2)' : 'var(--border)'}`,
        borderRadius:6, overflow:'hidden', boxShadow: selected ? '0 0 0 2px var(--accent2)' : '0 2px 8px var(--shadow)',
        cursor:'pointer', animation:'fadeIn 0.2s ease',
        transition:'transform 0.15s, box-shadow 0.15s',
        position:'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 0 0 2px var(--accent2), 0 6px 20px var(--shadow)`; }}
      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow= selected ? '0 0 0 2px var(--accent2)' : '0 2px 8px var(--shadow)'; }}
    >
      {/* 写真エリア */}
      <div style={{
        width:'100%', height: compact ? 75 : 150,
        background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center',
        position:'relative', overflow:'hidden', pointerEvents:'none',
      }}>
        {item.photo
          ? <img src={item.photo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : compact
            ? <span style={{ fontSize:11, color:'var(--ink3)' }}>{item.genre}</span>
            : <span style={{ fontSize:52 }}>{genreIcon(item.genre)}</span>
        }
        {/* ジャンルバッジ（コンパクト時非表示） */}
        {!compact && (
          <span style={{
            position:'absolute', top:8, left:8, padding:'3px 9px', borderRadius:3,
            fontSize:11, fontWeight:500, color:'#fff', background:color, pointerEvents:'none',
          }}>{item.genre}{typeStr}</span>
        )}
        {/* ステータスドット */}
        <span style={{
          position:'absolute', top:8, right:8, width:9, height:9, borderRadius:'50%',
          background: statusColors[status] || '#aaa', pointerEvents:'none',
        }} />
        {/* 重要マーク */}
        {isImportant && (
          <span style={{ position:'absolute', bottom:6, right:8, fontSize:14, pointerEvents:'none' }}>★</span>
        )}
      </div>

      {/* 本文（コンパクト時は最小限） */}
      {!compact && (
        <div style={{ padding:'12px 14px', pointerEvents:'none' }}>
          <div style={{ fontFamily:"'Noto Serif JP',serif", fontSize:15, fontWeight:700, lineHeight:1.4, marginBottom:5 }}>
            {item.name}
          </div>
          <div style={{ fontSize:14, marginBottom:6, letterSpacing:1 }}>{starsHTML(item.stars)}</div>
          {item.tags?.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
              {item.tags.map(t => (
                <span key={t} style={{ padding:'2px 7px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, fontSize:11, color:'var(--ink2)' }}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {dates.map((d, i) => {
            const fmt = v => !v ? '?' : (d.mode === 'month' ? v.slice(0,7) : v);
            return <div key={i} style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'var(--ink3)', marginBottom:2 }}>
              {i > 0 ? '再: ' : ''}{fmt(d.start)} 〜 {fmt(d.end)}
            </div>;
          })}
          {item.memo && (
            <div style={{
              fontSize:12, color:'var(--ink2)', lineHeight:1.6,
              borderTop:'1px dashed var(--border)', paddingTop:7, marginTop:6,
              overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical',
            }}>{item.memo}</div>
          )}
          {item.memoPhoto && (
            <img src={item.memoPhoto} alt="" style={{ width:'100%', marginTop:7, borderRadius:3, border:'1px solid var(--border)' }} />
          )}
        </div>
      )}

      {/* コンパクト時はタイトルと星だけ */}
      {compact && (
        <div style={{ padding:'6px 8px', pointerEvents:'none' }}>
          <div style={{ fontSize:12, fontWeight:700, lineHeight:1.3, marginBottom:2,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
          <div style={{ fontSize:11 }}>{starsHTML(item.stars)}</div>
        </div>
      )}

      {/* 選択チェック */}
      {selectMode && (
        <div style={{
          position:'absolute', top:6, left:6, width:22, height:22, borderRadius:'50%',
          background: selected ? 'var(--accent2)' : 'rgba(255,255,255,0.8)',
          border:`2px solid ${selected ? 'var(--accent2)' : 'var(--border)'}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:13, color:'#fff', fontWeight:700,
        }}>
          {selected ? '✓' : ''}
        </div>
      )}
    </div>
  );
}

export function genreIcon(g) {
  const map = { 'ゲーム':'G','映画':'M','小説':'B','マンガ':'C','アニメ':'A','音楽':'♪','心情':'◉','その他':'?' };
  return map[g] || '?';
}
