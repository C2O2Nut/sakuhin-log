// ===== bookmoryインポート =====
export async function importBookmory(arrayBuffer) {
  // JSZipを動的ロード
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const zip = await window.JSZip.loadAsync(arrayBuffer);
  let dbFile = zip.file('new_bookmory.db') || zip.file('bookmory.db');
  if (!dbFile) throw new Error('DBファイルが見つかりません');
  const dbBuf = await dbFile.async('arraybuffer');

  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js');
  const SQL = await window.initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`,
  });
  const db = new SQL.Database(new Uint8Array(dbBuf));

  const books = {};
  const bRes = db.exec("SELECT key, value FROM entry WHERE store='books'");
  if (bRes.length && bRes[0].values) {
    bRes[0].values.forEach(([key, val]) => {
      if (typeof key !== 'string') key = new TextDecoder().decode(key);
      try { books[key] = JSON.parse(val); } catch {}
    });
  }

  const notesByBid = {};
  const nRes = db.exec("SELECT key, value FROM entry WHERE store='notes'");
  if (nRes.length && nRes[0].values) {
    nRes[0].values.forEach(([, val]) => {
      try {
        const n = JSON.parse(val);
        const bid = String(n.bid);
        if (!notesByBid[bid]) notesByBid[bid] = [];
        let text = '';
        try {
          const ops = JSON.parse(n.book_content || n.content_quill || '[]');
          ops.forEach(op => { if (op.insert && typeof op.insert === 'string') text += op.insert; });
        } catch {}
        if (text.trim()) notesByBid[bid].push(text.trim());
      } catch {}
    });
  }
  db.close();

  const statusMap = { DONE:'完了', READING:'進行中', NOT_STARTED:'未着手', PAUSE:'進行中', GIVE_UP:'進行中' };
  const starMap = s => !s ? 0 : s <= 1.5 ? 1 : s <= 3 ? 2 : 3;

  return Object.keys(books).map(key => {
    const b = books[key];
    const dates = (b.reads || []).map(r => ({
      start: r.start ? new Date(r.start).toISOString().slice(0,10) : '',
      end:   r.end   ? new Date(r.end).toISOString().slice(0,10)   : '',
    }));
    const lastRead = b.reads?.length ? b.reads[b.reads.length-1] : null;
    return {
      id: Date.now() + Math.floor(Math.random() * 1000),
      name: b.title || '',
      genre: '小説',
      type: b.book_type === 'comic' ? 'マンガ' : '',
      stars: lastRead ? starMap(lastRead.star) : 0,
      tags: [],
      dates,
      status: b.status_list?.length ? (statusMap[b.status_list[b.status_list.length-1]] || '完了') : '未着手',
      memo: (notesByBid[key] || []).join('\n\n'),
      photo: b.image || null,
      memoPhoto: null,
      updatedAt: b.updated_at || Date.now(),
    };
  });
}

// ===== SteamインポートJSON解析 =====
export function parseSteamJson(jsonText) {
  const data = JSON.parse(jsonText);
  const games = data?.response?.games || data?.games || [];
  return games.map(g => ({
    appid: g.appid,
    name: g.name || `AppID: ${g.appid}`,
    playtime: g.playtime_forever || 0,
    lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString().slice(0,10) : '',
    img: g.appid ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg` : null,
  }));
}

export function steamGameToItem(g) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: g.name,
    genre: 'ゲーム',
    type: '',
    stars: 0,
    tags: [],
    dates: g.lastPlayed ? [{ start: '', end: g.lastPlayed }] : [],
    status: g.playtime > 0 ? '完了' : '未着手',
    memo: g.playtime > 0 ? `${Math.round(g.playtime / 60)} 時間プレイ` : '',
    photo: g.img || null,
    memoPhoto: null,
    updatedAt: Date.now(),
  };
}

// ===== Steam APIフェッチ =====
export async function fetchSteamGames(apiKey, steamId) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&format=json`;
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy);
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.response?.games) return parseSteamJson(JSON.stringify(data));
    } catch {}
  }
  throw new Error('取得失敗。JSONを手動で貼り付けてください。');
}

// ===== ユーティリティ =====
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ===== マージヘルパー =====
export function mergeItems(existing, incoming) {
  const result = [...existing];
  let added = 0, updated = 0;
  incoming.forEach(imp => {
    const idx = result.findIndex(x => x.name === imp.name);
    if (idx >= 0) { result[idx] = { ...result[idx], ...imp, id: result[idx].id }; updated++; }
    else { result.push(imp); added++; }
  });
  return { result, added, updated };
}
