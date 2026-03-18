import { useRef } from 'react';
import { useStore, getItemDates, getFirstDateUtil } from '../store/useStore';
import { genreIcon } from './CardItem';

export default function Timeline() {
  const { getFiltered, tlMode, tlLayout, importantIds, openModal, genreDefaultColor } = useStore();

  let dated = getFiltered().filter(x => getFirstDateUtil(x));
  if (tlMode === 'important') dated = dated.filter(x => !!importantIds[String(x.id)]);
  dated.sort((a, b) => getFirstDateUtil(a) > getFirstDateUtil(b) ? -1 : 1);

  // グルーピング: year -> month -> items[]
  const grouped = {};
  dated.forEach(item => {
    const d = getFirstDateUtil(item).split('-');
    const yr = d[0], mo = parseInt(d[1]);
    if (!grouped[yr]) grouped[yr] = {};
    if (!grouped[yr][mo]) grouped[yr][mo] = [];
    grouped[yr][mo].push(item);
  });
  const years = Object.keys(grouped).sort((a, b) => b - a);

  if (years.length === 0) {
    return (
      <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--ink3)' }}>
        <p style={{ fontSize:14, marginTop:10 }}>日付が入力された作品がありません</p>
      </div>
    );
  }

  const scrollToYear = (year) => {
    document.getElementById('tl-year-' + year)?.scrollIntoView({ behavior:'smooth', block:'start' });
  };

  return (
    <div>
      {/* 年の目次バー */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'16px 24px 8px' }}>
        {years.map(yr => (
          <button key={yr} onClick={() => scrollToYear(yr)} style={{
            padding:'4px 14px', border:'1.5px solid var(--border)', borderRadius:20,
            background:'none', fontFamily:"'DM Mono',monospace", fontSize:13,
            color:'var(--ink2)', cursor:'pointer',
          }}>{yr}</button>
        ))}
      </div>

      {/* 重要設定ボタン（重要モード時） */}
      {tlMode === 'important' && <ImportantSetter />}

      {/* 年ごとのセクション */}
      {years.map(yr => {
        const months = Object.keys(grouped[yr]).map(Number).sort((a, b) => b - a);
        return (
          <div key={yr} id={'tl-year-' + yr} style={{ marginBottom:8, scrollMarginTop:60 }}>
            <div style={{
              fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700,
              color:'var(--ink3)', padding:'16px 24px 8px', letterSpacing:'0.05em',
            }}>{yr}</div>
            {months.map((month, monthIdx) => (
              <MonthSection key={month} month={month} monthIdx={monthIdx}
                items={grouped[yr][month]} tlLayout={tlLayout}
                openModal={openModal} genreDefaultColor={genreDefaultColor} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MonthSection({ month, monthIdx, items, tlLayout, openModal, genreDefaultColor }) {
  if (tlLayout === 'zigzag') {
    const isRight = monthIdx % 2 === 0;
    return (
      <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 1fr', gap:0, minHeight:60 }}>
        {/* 左 */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', padding:'0 16px 16px', gap:8 }}>
          {!isRight && items.map(item => (
            <TlCard key={item.id} item={item} openModal={openModal} genreDefaultColor={genreDefaultColor} />
          ))}
        </div>
        {/* 中央（月ラベル＋縦線） */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:'var(--ink3)', flexShrink:0, marginTop:4 }} />
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'var(--ink3)', marginBottom:4 }}>{month}月</div>
          <div style={{ flex:1, width:2, background:'var(--border)' }} />
        </div>
        {/* 右 */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', padding:'0 16px 16px', gap:8 }}>
          {isRight && items.map(item => (
            <TlCard key={item.id} item={item} openModal={openModal} genreDefaultColor={genreDefaultColor} />
          ))}
        </div>
      </div>
    );
  }

  // 通常レイアウト
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:0, padding:'0 24px 20px' }}>
      <div style={{ width:36, fontFamily:"'DM Mono',monospace", fontSize:12, color:'var(--ink3)', paddingTop:4, flexShrink:0 }}>
        {month}月
      </div>
      <div style={{ width:2, background:'var(--border)', minHeight:40, flexShrink:0, alignSelf:'stretch' }} />
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, paddingLeft:16 }}>
        {items.map(item => (
          <TlCard key={item.id} item={item} openModal={openModal} genreDefaultColor={genreDefaultColor} />
        ))}
      </div>
    </div>
  );
}

function TlCard({ item, openModal, genreDefaultColor }) {
  const dates = getItemDates(item);
  const color = item.color || genreDefaultColor(item.genre);
  const typeStr = item.type ? ' / ' + item.type : '';

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
      <div onClick={() => openModal(item.id)} style={{
        width:120, background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:6, overflow:'hidden', cursor:'pointer',
        boxShadow:'0 2px 8px var(--shadow)', transition:'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 16px var(--shadow)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 2px 8px var(--shadow)'; }}
      >
        <div style={{ height:72, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' }}>
          {item.photo
            ? <img src={item.photo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : <span style={{ fontSize:28 }}>{genreIcon(item.genre)}</span>
          }
          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:color, color:'#fff', fontSize:9, padding:'2px 6px', opacity:0.9 }}>
            {item.genre}{typeStr}
          </div>
        </div>
        <div style={{ padding:'6px 8px' }}>
          <div style={{ fontSize:11, fontWeight:700, lineHeight:1.3, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {item.name}
          </div>
          <div style={{ fontSize:11, color:'#d4920a' }}>
            {Array.from({length:3},(_,i) => i<item.stars?'★':'☆').join('')}
          </div>
        </div>
      </div>
      {/* 期間線 */}
      {dates.map((d, i) => {
        if (!d.start && !d.end) return null;
        if (d.mode === 'month') return null;
        const hasBoth = d.start && d.end;
        const hasOnlyEnd = !d.start && d.end;
        if (hasBoth) return <div key={i} style={{ width:3, height:28, background:color }} />;
        if (hasOnlyEnd) return (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{ width:3, height:14, background:color }} />
            <div style={{ borderLeft:`3px dotted ${color}`, height:20 }} />
          </div>
        );
        return null;
      })}
    </div>
  );
}

function ImportantSetter() {
  const { items, importantIds, setImportantIds } = useStore();
  const [open, setOpen] = require('react').useState(false);
  const [local, setLocal] = require('react').useState({ ...importantIds });

  const toggle = (id) => setLocal(prev => {
    const n = { ...prev };
    if (n[id]) delete n[id]; else n[id] = true;
    return n;
  });

  const handleSave = () => {
    setImportantIds(local);
    setOpen(false);
  };

  return (
    <div style={{ padding:'0 24px 8px' }}>
      <button onClick={() => setOpen(true)} style={{
        padding:'5px 14px', border:'1.5px solid var(--border)', borderRadius:4,
        background:'transparent', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13,
        color:'var(--ink2)', cursor:'pointer',
      }}>重要を設定…</button>

      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setOpen(false)}>
          <div style={{ background:'var(--surface)', borderRadius:8, padding:24, width:440, maxWidth:'95vw', maxHeight:'70vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily:"'Noto Serif JP',serif", marginBottom:16, fontSize:15 }}>重要に設定する作品</h3>
            {items.map(item => (
              <label key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
                <input type="checkbox" checked={!!local[String(item.id)]} onChange={() => toggle(String(item.id))} />
                <span style={{ fontSize:13 }}>{item.name}</span>
              </label>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setOpen(false)} style={{ padding:'8px 16px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:4, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13 }}>キャンセル</button>
              <button onClick={handleSave} style={{ padding:'8px 16px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13 }}>完了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
