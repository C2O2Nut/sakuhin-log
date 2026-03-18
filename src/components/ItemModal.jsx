import { useState, useEffect, useRef } from 'react';
import { useStore, getItemDates } from '../store/useStore';
import { showToast } from './Toast';

export default function ItemModal() {
  const { modalOpen, editingId, items, closeModal, addItem, updateItem, deleteItem,
    getAllGenres, genreDefaultColor, addGenre, importantIds, toggleImportant } = useStore();

  const isEditing = editingId !== null;
  const existingItem = isEditing ? items.find(x => String(x.id) === String(editingId)) : null;

  const genres = getAllGenres().map(g => typeof g === 'string' ? g : g.name);

  const [name, setName] = useState('');
  const [genre, setGenre] = useState('ゲーム');
  const [type, setType] = useState('');
  const [color, setColor] = useState('#2a6e8c');
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState('');
  const [dates, setDates] = useState([]);
  const [status, setStatus] = useState('完了');
  const [memo, setMemo] = useState('');
  const [photo, setPhoto] = useState(null);
  const [memoPhoto, setMemoPhoto] = useState(null);
  const nameRef = useRef(null);

  // モーダルが開くたびに初期化
  useEffect(() => {
    if (!modalOpen) return;
    if (existingItem) {
      setName(existingItem.name || '');
      setGenre(existingItem.genre || 'ゲーム');
      setType(existingItem.type || '');
      setColor(existingItem.color || genreDefaultColor(existingItem.genre || 'ゲーム'));
      setStars(existingItem.stars || 0);
      setTags((existingItem.tags || []).join(' '));
      setDates(getItemDates(existingItem));
      setStatus(existingItem.status || '完了');
      setMemo(existingItem.memo || '');
      setPhoto(existingItem.photo || null);
      setMemoPhoto(existingItem.memoPhoto || null);
    } else {
      setName(''); setGenre('ゲーム'); setType('');
      setColor(genreDefaultColor('ゲーム')); setStars(0);
      setTags(''); setDates([]); setStatus('完了');
      setMemo(''); setPhoto(null); setMemoPhoto(null);
    }
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [modalOpen, editingId]);

  // ジャンル変更時に色をデフォルトに
  const handleGenreChange = (g) => {
    setGenre(g);
    setColor(genreDefaultColor(g));
  };

  const handlePhotoChange = (e, isMemo) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (isMemo) setMemoPhoto(ev.target.result);
      else setPhoto(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!name.trim()) { showToast('作品名を入力してください', 'error'); return; }
    const item = {
      id: isEditing ? existingItem.id : Date.now(),
      name: name.trim(), genre, type: type.trim(), color,
      stars, tags: tags.trim().split(/\s+/).filter(Boolean),
      dates, status, memo: memo.trim(), photo, memoPhoto,
      updatedAt: Date.now(),
    };
    if (isEditing) updateItem(existingItem.id, item);
    else addItem(item);
    showToast(isEditing ? '保存しました' : '追加しました');
    closeModal();
  };

  const handleDelete = () => {
    if (!confirm('この作品を削除しますか？')) return;
    deleteItem(editingId);
    showToast('削除しました');
    closeModal();
  };

  const handleAddGenre = () => {
    const n = prompt('新しいジャンル名:');
    if (!n) return;
    const c = prompt('色（例：#ff6600）:', '#888888') || '#888';
    if (addGenre(n, c)) { setGenre(n); setColor(c); showToast('ジャンルを追加しました'); }
    else showToast('既に存在するジャンルです', 'error');
  };

  const addDateRow = () => setDates(d => [...d, { start:'', end:'', mode:'day' }]);
  const removeDateRow = (i) => setDates(d => d.filter((_, idx) => idx !== i));
  const updateDate = (i, key, val) => setDates(d => d.map((row, idx) => idx === i ? { ...row, [key]: val } : row));
  const toggleDateMode = (i) => setDates(d => d.map((row, idx) => idx === i ? { ...row, mode: row.mode === 'month' ? 'day' : 'month' } : row));

  const isImportant = existingItem && importantIds[String(existingItem.id)];

  if (!modalOpen) return null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div style={{ background:'var(--surface)', borderRadius:8, width:520, maxWidth:'100%', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        {/* ヘッダー */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h2 style={{ fontFamily:"'Noto Serif JP',serif", fontSize:16 }}>{isEditing ? '作品を編集' : '新しい作品を追加'}</h2>
          <button onClick={closeModal} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink3)', lineHeight:1 }}>×</button>
        </div>

        {/* ボディ */}
        <div style={{ padding:'20px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:14 }}>
          <Field label="作品名 *">
            <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="例：FF7 リバース" style={inputStyle} />
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="ジャンル">
              <select value={genre} onChange={e => handleGenreChange(e.target.value)} style={inputStyle}>
                {genres.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button type="button" onClick={handleAddGenre} style={{ marginTop:4, fontSize:11, background:'none', border:'none', color:'var(--accent2)', cursor:'pointer', padding:0 }}>
                ＋ ジャンルを追加
              </button>
            </Field>
            <Field label="種類・カテゴリ">
              <input value={type} onChange={e => setType(e.target.value)} placeholder="例：RPG、ホラー" style={inputStyle} />
            </Field>
          </div>

          <Field label="テーマカラー（年表の線の色）">
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ height:32, width:48, padding:2, border:'1.5px solid var(--border)', borderRadius:4, cursor:'pointer' }} />
              <span style={{ fontSize:12, color:'var(--ink3)' }}>年表に色付き線で表示されます</span>
            </div>
          </Field>

          <Field label="おもしろさ（3段階）">
            <div style={{ display:'flex', gap:8 }}>
              {[1,2,3].map(v => (
                <button key={v} type="button" onClick={() => setStars(stars === v ? 0 : v)} style={{
                  fontSize:22, background:'none', border:'none', cursor:'pointer',
                  color: v <= stars ? '#d4920a' : 'var(--border)',
                }}>★</button>
              ))}
            </div>
          </Field>

          <Field label="タグ（スペース区切り）">
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="例：名作 泣ける SF" style={inputStyle} />
          </Field>

          <Field label="写真">
            <div style={{ border:'1.5px dashed var(--border)', borderRadius:4, overflow:'hidden', cursor:'pointer', minHeight:80, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', background:'var(--surface2)' }}>
              {photo
                ? <img src={photo} alt="" style={{ maxWidth:'100%', maxHeight:200, display:'block' }} />
                : <span style={{ fontSize:13, color:'var(--ink3)' }}>クリックして画像を選択</span>
              }
              <input type="file" accept="image/*" onChange={e => handlePhotoChange(e, false)}
                style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer' }} />
            </div>
            {photo && <button type="button" onClick={() => setPhoto(null)} style={clearBtnStyle}>写真を削除</button>}
          </Field>

          <Field label="プレイ・視聴期間">
            {dates.map((d, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                <button type="button" onClick={() => toggleDateMode(i)} style={{
                  padding:'2px 8px', fontSize:11, border:'1.5px solid var(--border)', borderRadius:12,
                  background: d.mode === 'month' ? 'var(--ink2)' : 'transparent',
                  color: d.mode === 'month' ? '#fff' : 'var(--ink2)', cursor:'pointer', flexShrink:0,
                }}>{d.mode === 'month' ? '月' : '日'}</button>
                <input type={d.mode === 'month' ? 'month' : 'date'} value={d.start || ''} onChange={e => updateDate(i,'start',e.target.value)}
                  style={{ ...inputStyle, flex:1, fontSize:12 }} />
                <span style={{ color:'var(--ink3)' }}>〜</span>
                <input type={d.mode === 'month' ? 'month' : 'date'} value={d.end || ''} onChange={e => updateDate(i,'end',e.target.value)}
                  style={{ ...inputStyle, flex:1, fontSize:12 }} />
                <button type="button" onClick={() => removeDateRow(i)} style={{ background:'none', border:'none', color:'var(--ink3)', cursor:'pointer', fontSize:16, lineHeight:1, flexShrink:0 }}>×</button>
              </div>
            ))}
            <button type="button" onClick={addDateRow} style={{ fontSize:12, background:'none', border:'1.5px dashed var(--border)', borderRadius:4, color:'var(--ink2)', cursor:'pointer', padding:'4px 10px' }}>
              ＋ 期間を追加
            </button>
          </Field>

          <Field label="状態">
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, width:'auto' }}>
              <option value="完了">完了</option>
              <option value="進行中">進行中</option>
              <option value="未着手">未着手</option>
            </select>
          </Field>

          <Field label="メモ">
            <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="感想、印象に残ったこと…"
              style={{ ...inputStyle, minHeight:90, resize:'vertical' }} />
          </Field>

          <Field label="メモ写真">
            <div style={{ border:'1.5px dashed var(--border)', borderRadius:4, overflow:'hidden', cursor:'pointer', minHeight:60, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', background:'var(--surface2)' }}>
              {memoPhoto
                ? <img src={memoPhoto} alt="" style={{ maxWidth:'100%', maxHeight:160, display:'block' }} />
                : <span style={{ fontSize:13, color:'var(--ink3)' }}>クリックして画像を追加</span>
              }
              <input type="file" accept="image/*" onChange={e => handlePhotoChange(e, true)}
                style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer' }} />
            </div>
            {memoPhoto && <button type="button" onClick={() => setMemoPhoto(null)} style={clearBtnStyle}>メモ画像を削除</button>}
          </Field>
        </div>

        {/* フッター */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
          {isEditing && (
            <>
              <button type="button" onClick={handleDelete} style={{ padding:'8px 14px', background:'transparent', border:'1.5px solid #c94a2a', color:'#c94a2a', borderRadius:4, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13 }}>削除</button>
              <button type="button" onClick={() => toggleImportant(editingId)} style={{ padding:'8px 14px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:4, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, color: isImportant ? '#d4920a' : 'var(--ink2)' }}>
                {isImportant ? '★ 重要' : '☆ 重要'}
              </button>
            </>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button type="button" onClick={closeModal} style={{ padding:'8px 16px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:4, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13 }}>キャンセル</button>
            <button type="button" onClick={handleSave} style={{ padding:'8px 18px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, fontWeight:500 }}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:12, color:'var(--ink2)', fontWeight:500 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width:'100%', padding:'8px 10px', border:'1.5px solid var(--border)', borderRadius:4,
  fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, background:'var(--surface)',
  color:'var(--ink)', outline:'none', boxSizing:'border-box',
};
const clearBtnStyle = {
  marginTop:4, fontSize:11, background:'none', border:'none', color:'var(--ink3)',
  cursor:'pointer', padding:0, textDecoration:'underline',
};
