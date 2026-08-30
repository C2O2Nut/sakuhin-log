// ==================== メインアプリ本体 ====================
(function() {
  'use strict';

  // ===== データ =====
  var items = [];
  try { items = JSON.parse(localStorage.getItem('sakuhin-log') || '[]'); } catch(e) { items = []; }
  // 音楽ジャンルを「その他」に移行
  items.forEach(function(x){ if(x.genre==='音楽') x.genre='その他'; });

  // ===== ジャンル管理 =====
  var DEFAULT_GENRES = ['ゲーム','映画','小説','マンガ','アニメ','心情','その他'];
  var DEFAULT_GENRE_COLORS = {
    'ゲーム':'#2a6e8c','映画':'#c94a2a','小説':'#5a7a3a','マンガ':'#8c5a2a',
    'アニメ':'#6a2a8c','心情':'#8c3a6a','その他':'#555'
  };
  var customGenres = [];
  try { customGenres = JSON.parse(localStorage.getItem('sakuhin-genres') || '[]'); } catch(e) {}

  function getAllGenres() {
    return DEFAULT_GENRES.concat(customGenres);
  }

  function saveGenres() {
    localStorage.setItem('sakuhin-genres', JSON.stringify(customGenres));
  }

  function addGenre(name, color) {
    if (!name || getAllGenres().indexOf(name) !== -1) return false;
    customGenres.push({ name: name, color: color || '#888' });
    saveGenres();
    rebuildGenreUI();
    return true;
  }

  function rebuildGenreUI() {
    var genres = getAllGenres();

    // ツールバーボタン
    var container = el('genre-filter-btns');
    container.innerHTML = '';
    container.style.cssText = 'display:contents;';
    genres.forEach(function(g) {
      var name = typeof g === 'string' ? g : g.name;
      var btn = document.createElement('button');
      btn.className = 'filter-btn genre-filter-item';
      btn.setAttribute('data-genre', name);
      btn.textContent = name;
      btn.addEventListener('click', function() {
        if (currentFilter.has(name)) { currentFilter.delete(name); }
        else { currentFilter.add(name); }
        updateFilterBtns();
        if (currentView === 'grid') renderGrid(); else renderTimeline();
      });
      container.appendChild(btn);
    });

    // モーダルのselect
    var sel = el('f-genre');
    var curVal = sel.value;
    sel.innerHTML = '';
    genres.forEach(function(g) {
      var name = typeof g === 'string' ? g : g.name;
      var opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
    if (curVal) sel.value = curVal;

    // フィルターボタンの状態を反映
    updateFilterBtns();
  }

  var currentFilter = new Set(); // 空 = すべて表示
  var currentTagFilter = null;
  var currentStarFilter = 0; // 0=すべて 1/2/3=その星以上
  var currentView = 'grid';
  var currentLayout = localStorage.getItem('sakuhin-layout') || 'normal';
  var currentSort = 'default';
  var tlMode = 'normal'; // 'normal' | 'important'
  var tlLayout = 'normal'; // 'normal' | 'zigzag'
  var importantIds = JSON.parse(localStorage.getItem('sakuhin-important') || '{}');
  var selectMode = false;
  var selectedIds = new Set();
  var editingId = null;
  var currentStar = 0;
  var photoData = null;
  var memoPhotoData = null;
  // v3変数
  var currentPage = 'list';
  var groupByGenre = false;
  var currentFolderId = null;
  var moodEditingId = null;
  var folderEditingId = null;
  var folderStar = 0;


  // ===== スマートマージ関数 =====
  function smartMerge(existing, imported, cb) {
    var added = 0, skipped = 0, memoMerged = 0;
    var conflictQueue = []; // メモが全く違うもの

    imported.forEach(function(imp) {
      var idx = -1;
      for (var i = 0; i < existing.length; i++) {
        if (existing[i].name === imp.name) { idx = i; break; }
      }
      if (idx < 0) {
        // 新規 → 追加
        existing.unshift(imp);
        added++;
        return;
      }
      var ex = existing[idx];
      // 重複あり → 星は上書きしない
      // メモの処理
      var exMemo = (ex.memo || '').trim();
      var impMemo = (imp.memo || '').trim();
      if (impMemo && impMemo !== exMemo) {
        if (!exMemo) {
          // 既存メモなし → そのまま追記
          existing[idx] = Object.assign({}, ex, { memo: impMemo, stars: ex.stars });
          memoMerged++;
        } else if (impMemo.indexOf(exMemo) !== -1 || exMemo.indexOf(impMemo) !== -1) {
          // 片方がもう一方を含む → 長い方を採用
          var merged = impMemo.length > exMemo.length ? impMemo : exMemo;
          existing[idx] = Object.assign({}, ex, { memo: merged, stars: ex.stars });
          memoMerged++;
        } else {
          // 全く別の内容 → コンフリクトキューに積む
          conflictQueue.push({ idx: idx, ex: ex, imp: imp, exMemo: exMemo, impMemo: impMemo });
        }
      }
      skipped++;
    });

    // コンフリクト解決
    function resolveNext() {
      if (conflictQueue.length === 0) {
        cb(added, skipped, memoMerged);
        return;
      }
      var c = conflictQueue.shift();
      var msg = '「' + c.ex.name + '」のメモが異なります。\n\n'
        + '【現在】\n' + c.exMemo + '\n\n'
        + '【インポート】\n' + c.impMemo + '\n\n'
        + 'OKで「インポートを採用」、キャンセルで「現在のまま維持」';
      if (confirm(msg)) {
        existing[c.idx] = Object.assign({}, c.ex, { memo: c.impMemo, stars: c.ex.stars });
        memoMerged++;
      }
      resolveNext();
    }
    resolveNext();
  }

  // 画像をJPEG・最大800pxに圧縮してBase64返す
  function compressImage(dataUrl, callback) {
    var img = new Image();
    img.onload = function() {
      var max = 800;
      var w = img.width, h = img.height;
      if (w > max) { h = Math.round(h * max / w); w = max; }
      if (h > max) { w = Math.round(w * max / h); h = max; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  }

  function saveData() {
    try { localStorage.setItem('sakuhin-log', JSON.stringify(items)); } catch(e) {}
  }

  // ===== ユーティリティ =====
  function el(id) { return document.getElementById(id); }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var _toastTimer = null;
  function showToast(msg, type) {
    var t = el('toast');
    t.textContent = msg;
    t.className = 'show' + (type ? ' ' + type : '');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() { t.className = ''; }, 2800);
  }

  function showLoading() { el('loading-spinner').classList.add('show'); }
  function hideLoading() { el('loading-spinner').classList.remove('show'); }

  function starsHTML(n) {
    var h = '';
    for (var i = 1; i <= 3; i++) h += '<span class="' + (i <= n ? 'star-filled' : 'star-empty') + '">' + (i <= n ? '★' : '☆') + '</span>';
    return h;
  }

  function genreIcon(g) {
    var map = { 'ゲーム':'G','映画':'M','小説':'B','マンガ':'C','アニメ':'A','音楽':'♪','心情':'◉','その他':'?' };
    return map[g] || '?';
  }

  // ジャンルごとのデフォルト色
  function genreDefaultColor(g) {
    if (DEFAULT_GENRE_COLORS[g]) return DEFAULT_GENRE_COLORS[g];
    // カスタムジャンルの色を探す
    for (var i = 0; i < customGenres.length; i++) {
      if (customGenres[i].name === g) return customGenres[i].color;
    }
    return '#888';
  }

  // 月モードの値（YYYY-MM）をYYYY-MM-01に正規化して比較可能にする
  function normDate(v) {
    if (!v) return '';
    if (/^\d{4}-\d{2}$/.test(v)) return v + '-01';
    return v;
  }

  function getFirstDate(item) {
    var dates = item.dates || (item.dateStart || item.dateEnd ? [{ start: item.dateStart||'', end: item.dateEnd||'' }] : []);
    for (var i = 0; i < dates.length; i++) {
      if (dates[i].start) return normDate(dates[i].start);
      if (dates[i].end)   return normDate(dates[i].end);
    }
    return null;
  }

  function getItemDates(item) {
    return item.dates || (item.dateStart || item.dateEnd ? [{ start: item.dateStart||'', end: item.dateEnd||'' }] : []);
  }

  // ===== 星評価 =====
  function setStar(val) {
    currentStar = val;
    var btns = document.querySelectorAll('#star-input button');
    btns.forEach(function(b, i) {
      b.textContent = i < val ? '★' : '☆';
      b.style.color = i < val ? '#d4920a' : '#aaa';
    });
  }

  // ===== 日付行 =====
  // mode: 'day'(デフォルト) or 'month'
  function addDateRow(start, end, mode) {
    var list = el('date-list');
    var row = document.createElement('div');
    row.className = 'date-row';
    row.setAttribute('data-mode', mode || 'day');

    // モード切替ボタン
    var modeBtn = document.createElement('button');
    modeBtn.type = 'button';
    modeBtn.style.cssText = 'font-size:10px;padding:2px 6px;border:1px solid var(--border);border-radius:3px;background:none;color:var(--ink3);cursor:pointer;flex-shrink:0;white-space:nowrap;';
    modeBtn.textContent = mode === 'month' ? '月' : '日';
    modeBtn.title = '日付モードを切り替え';

    var isMonth = (mode === 'month');

    var s = document.createElement('input');
    s.type = isMonth ? 'month' : 'date';
    s.className = 'date-start';
    // 月モードの場合はYYYY-MM形式に変換
    s.value = isMonth ? (start ? start.slice(0,7) : '') : (start || '');

    var sep = document.createElement('span');
    sep.className = 'date-sep'; sep.textContent = '〜';

    var e = document.createElement('input');
    e.type = isMonth ? 'month' : 'date';
    e.className = 'date-end';
    e.value = isMonth ? (end ? end.slice(0,7) : '') : (end || '');

    var rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'date-remove'; rm.textContent = '×';
    rm.addEventListener('click', function() { row.remove(); });

    // モード切替処理
    modeBtn.addEventListener('click', function() {
      var cur = row.getAttribute('data-mode');
      var newMode = cur === 'month' ? 'day' : 'month';
      row.setAttribute('data-mode', newMode);
      modeBtn.textContent = newMode === 'month' ? '月' : '日';
      var sv = s.value, ev = e.value;
      s.type = newMode === 'month' ? 'month' : 'date';
      e.type = newMode === 'month' ? 'month' : 'date';
      // 値を変換（日→月: YYYY-MM-DDをYYYY-MMに、月→日: YYYY-MMをYYYY-MM-01に）
      if (newMode === 'month') {
        s.value = sv ? sv.slice(0,7) : '';
        e.value = ev ? ev.slice(0,7) : '';
      } else {
        s.value = sv ? sv + '-01' : '';
        e.value = ev ? ev + '-01' : '';
      }
    });

    row.appendChild(modeBtn); row.appendChild(s); row.appendChild(sep); row.appendChild(e); row.appendChild(rm);
    list.appendChild(row);
  }

  function getDates() {
    var result = [];
    document.querySelectorAll('#date-list .date-row').forEach(function(r) {
      var mode = r.getAttribute('data-mode') || 'day';
      var s = r.querySelector('.date-start').value;
      var e = r.querySelector('.date-end').value;
      if (!s && !e) return;
      // 月モードの場合はYYYY-MM形式のまま保存（表示時に判別）
      result.push({ start: s, end: e, mode: mode });
    });
    return result;
  }

  function renderDateList(dates) {
    el('date-list').innerHTML = '';
    if (!dates || dates.length === 0) {
      addDateRow('', '', 'day');
    } else {
      dates.forEach(function(d) { addDateRow(d.start, d.end, d.mode || 'day'); });
    }
  }

  // ===== モーダル =====
  function openModal(id) {
    editingId = (id !== undefined && id !== null) ? id : null;
    currentStar = 0; photoData = null; memoPhotoData = null;
    setStar(0);

    el('photo-preview').style.display = 'none'; el('photo-preview').src = '';
    el('photo-placeholder').style.display = 'block'; el('f-photo').value = '';
    el('memo-preview').style.display = 'none'; el('memo-preview').src = '';
    el('memo-placeholder').style.display = 'block';
    el('memo-clear-btn').style.display = 'none'; el('f-memo-photo').value = '';

    if (editingId !== null) {
      var item = null;
      // 型が混在する可能性があるので文字列比較で一致を確認
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].id) === String(editingId)) { item = items[i]; editingId = items[i].id; break; }
      }
      if (!item) { editingId = null; return; }

      el('modal-title').textContent = '作品を編集';
      el('f-name').value = item.name || '';
      el('f-genre').value = item.genre || 'ゲーム';
      el('f-type').value = item.type || '';
      el('f-tags').value = (item.tags || []).join(' ');
      el('f-color').value = item.color || genreDefaultColor(item.genre || 'ゲーム');
      renderDateList(getItemDates(item));
      el('f-status').value = item.status || '完了';
      el('f-memo').value = item.memo || '';
      el('btn-delete').style.display = 'inline-block';
      el('btn-important').style.display = 'inline-block';
      updateImportantBtn(editingId);
      setStar(item.stars || 0);
      if (item.photo) {
        photoData = item.photo;
        el('photo-preview').src = item.photo; el('photo-preview').style.display = 'block';
        el('photo-placeholder').style.display = 'none';
      }
      if (item.memoPhoto) {
        memoPhotoData = item.memoPhoto;
        el('memo-preview').src = item.memoPhoto; el('memo-preview').style.display = 'block';
        el('memo-placeholder').style.display = 'none';
        el('memo-clear-btn').style.display = 'block';
      }
    } else {
      el('modal-title').textContent = '新しい作品を追加';
      el('f-name').value = ''; el('f-genre').value = 'ゲーム'; el('f-type').value = '';
      el('f-color').value = genreDefaultColor('ゲーム');
      el('f-tags').value = ''; renderDateList([]); el('f-status').value = '完了';
      el('f-memo').value = ''; el('btn-delete').style.display = 'none';
      el('btn-important').style.display = 'none';
    }
    // フォルダーselect初期化
    var pf = editingId!==null ? items.find(function(f){return f.cardType==='folder'&&(f.childIds||[]).indexOf(String(editingId))!==-1;}) : null;
    refreshFolderSelect(pf ? String(pf.id) : '');
    el('modal').classList.add('open');
    el('f-name').focus();
  }

  function closeModal() {
    el('modal').classList.remove('open');
    editingId = null;
  }

  function saveItem() {
    var name = el('f-name').value.trim();
    if (!name) { alert('作品名を入力してください'); return; }

    var item = {
      id: editingId !== null ? editingId : Date.now(),
      name: name,
      genre: el('f-genre').value,
      type: el('f-type').value.trim(),
      color: el('f-color').value,
      stars: currentStar,
      tags: el('f-tags').value.trim().split(/\s+/).filter(Boolean),
      dates: getDates(),
      status: el('f-status').value,
      memo: el('f-memo').value.trim(),
      color: el('f-color').value,
      photo: photoData,
      memoPhoto: memoPhotoData,
      color: el('f-color').value || null,
      updatedAt: Date.now()
    };

    if (editingId !== null) {
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].id) === String(editingId)) { items[i] = item; break; }
      }
    } else {
      items.unshift(item);
    }
    // フォルダー割り当て
    var iidStr = String(item.id);
    var fsel = el('f-folder-select');
    if (fsel) {
      var fid = fsel.value;
      items.forEach(function(f){ if(f.cardType==='folder') f.childIds=(f.childIds||[]).filter(function(c){return c!==iidStr;}); });
      if (fid) { var tf=items.find(function(f){return String(f.id)===fid;}); if(tf){if(!tf.childIds)tf.childIds=[];if(tf.childIds.indexOf(iidStr)===-1)tf.childIds.push(iidStr);} }
    }
    saveData(); closeModal();
    if (currentView === 'grid') renderGrid(); else renderTimeline();
  }

  function deleteItem() {
    if (!confirm('この作品を削除しますか？')) return;
    items = items.filter(function(x) { return String(x.id) !== String(editingId); });
    saveData(); closeModal();
    if (currentView === 'grid') renderGrid(); else renderTimeline();
  }

  // ===== カードビュー =====
  function getLastDate(item) {
    var dates = getItemDates(item);
    var last = '';
    dates.forEach(function(d) { if (d.end && d.end > last) last = d.end; if (d.start && d.start > last) last = d.start; });
    return last;
  }

  function getFiltered() {
    if (currentFolderId) {
      var folder = items.find(function(x){ return String(x.id)===String(currentFolderId); });
      var cids = folder ? (folder.childIds||[]) : [];
      return items.filter(function(x){ return cids.indexOf(String(x.id))!==-1; });
    }
    // どのフォルダーにも入っているIDを収集
    var inFolderIds = {};
    items.forEach(function(f){
      if (f.cardType === 'folder') {
        (f.childIds||[]).forEach(function(cid){ inFolderIds[cid] = true; });
      }
    });
    var result = currentFilter.size === 0
      ? items.filter(function(x){ return !inFolderIds[String(x.id)]; })
      : items.filter(function(x){ return !inFolderIds[String(x.id)] && currentFilter.has(x.genre); });
    if (currentTagFilter) {
      result = result.filter(function(x) { return (x.tags||[]).indexOf(currentTagFilter) !== -1; });
    }
    if (currentStarFilter > 0) {
      result = result.filter(function(x) { return (x.stars || 0) >= currentStarFilter; });
    }
    return result;
  }

  function getLastDate(item) {
    var dates = getItemDates(item);
    var last = '';
    dates.forEach(function(d) {
      var e = normDate(d.end), s = normDate(d.start);
      if (e && e > last) last = e;
      if (s && s > last) last = s;
    });
    return last;
  }

  function getSorted(arr) {
    var copy = arr.slice();
    if (currentSort === 'name') {
      copy.sort(function(a,b) { return a.name.localeCompare(b.name, 'ja'); });
    } else if (currentSort === 'lastdate') {
      copy.sort(function(a,b) {
        var da = getLastDate(a), db = getLastDate(b);
        return da < db ? 1 : da > db ? -1 : 0;
      });
    } else if (currentSort === 'stars_desc') {
      copy.sort(function(a,b) { return (b.stars||0) - (a.stars||0); });
    } else if (currentSort === 'stars_asc') {
      copy.sort(function(a,b) { return (a.stars||0) - (b.stars||0); });
    }
    return copy;
  }

  function renderGrid() {
    var filtered = getSorted(getFiltered());
    el('header-count').textContent = items.length + ' 件';
    var filterLabel = currentTagFilter
      ? (currentFilter.size > 0 ? Array.from(currentFilter).join('・') + ' / ' : '') + '#' + currentTagFilter
      : currentFilter.size > 0 ? Array.from(currentFilter).join('・') : '';
    el('count-bar').textContent = filtered.length + ' 件' + (filterLabel ? '（' + filterLabel + '）' : '（全件）');

    var grid = el('grid-view');
    // レイアウト切り替え
    grid.className = currentLayout === 'compact' ? 'grid compact' : 'grid';

    if (filtered.length === 0) {
      var emptyMsg = currentTagFilter
        ? '#' + currentTagFilter + ' の作品がありません'
        : currentFilter.size > 0
          ? Array.from(currentFilter).join('・') + 'の作品がありません'
          : 'まだ作品がありません。「＋ 追加」から登録しよう！';
      grid.innerHTML = '<div class="empty"><p>' + emptyMsg + '</p></div>';
      return;
    }

    grid.innerHTML = '';

    // ジャンル別グループ表示
    if (groupByGenre && !currentFolderId) {
      var groups = {};
      var groupOrder = [];
      filtered.forEach(function(item) {
        var g = item.cardType === 'mood' ? 'ムード' : item.cardType === 'folder' ? 'フォルダー' : (item.genre || 'その他');
        if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
        groups[g].push(item);
      });
      groupOrder.forEach(function(genre) {
        var header = document.createElement('div');
        header.className = 'genre-group-header';
        var color = genreDefaultColor(genre);
        header.innerHTML = '<span class="genre-dot" style="background:' + color + '"></span>'
          + escapeHTML(genre)
          + '<span class="genre-group-count">(' + groups[genre].length + ')</span>';
        grid.appendChild(header);
        groups[genre].forEach(function(item) { appendCard(item, grid); });
      });
      return;
    }

    filtered.forEach(function(item) {
      var dates = getItemDates(item);
      var datesHTML = dates.map(function(d, i) {
        var isMonth = d.mode === 'month';
        var fmt = function(v) {
          if (!v) return '?';
          if (isMonth) return v.slice(0,7); // YYYY-MM
          return v;
        };
        return '<div class="card-dates">' + (i > 0 ? '再: ' : '') + fmt(d.start) + ' 〜 ' + fmt(d.end) + '</div>';
      }).join('');
      var tagsHTML = (item.tags||[]).map(function(t) { return '<span class="tag">' + escapeHTML(t) + '</span>'; }).join('');
      var typeStr = item.type ? ' / ' + item.type : '';
      var status = item.status || '完了';

      var card;
      if (item.cardType==='mood') { card=makeMoodCard(item); }
      else if (item.cardType==='folder') { card=makeFolderCard(item); }
      else {
      card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="card-photo">'
        + (item.photo
          ? '<img src="' + item.photo + '" alt="">'
          : '<span style="font-size:52px">' + genreIcon(item.genre) + '</span>'
            + '<div class="card-photo-placeholder">' + item.genre + (item.type ? '<br><span style="font-size:9px;opacity:0.7">' + item.type + '</span>' : '') + '</div>')
        + '<span class="card-genre-badge" style="background:' + genreDefaultColor(item.genre) + '">' + escapeHTML(item.genre) + escapeHTML(typeStr) + '</span>'
        + '<span class="status-dot ' + status + '" title="' + status + '"></span>'
        + '</div>'
        + '<div class="card-body">'
        + '<div class="card-title">' + escapeHTML(item.name) + '</div>'
        + '<div class="card-stars">' + starsHTML(item.stars) + '</div>'
        + (tagsHTML ? '<div class="card-tags">' + tagsHTML + '</div>' : '')
        + datesHTML
        + (item.memo ? '<div class="card-memo">' + escapeHTML(item.memo) + '</div>' : '')
        /* memoPhotoはカードに表示しない */
        + '</div>';
      } // end else
      card.setAttribute('data-id', String(item.id));
      card.setAttribute('draggable', 'true');
      if (currentFolderId) {
        var removeBtn = document.createElement('button');
        removeBtn.className = 'folder-remove-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'フォルダーから外す';
        removeBtn.setAttribute('data-remove-id', String(item.id));
        card.appendChild(removeBtn);
      }
      var check = document.createElement('div');
      check.className = 'select-check';
      check.textContent = '✓';
      card.appendChild(check);
      if (selectedIds.has(String(item.id))) card.classList.add('selected');
      grid.appendChild(card);
    });
  }

  // カード1枚をgridに追加するヘルパー（ジャンルグループ用）
  function appendCard(item, grid) {
    var dates = getItemDates(item);
    var datesHTML = dates.map(function(d, i) {
      var isMonth = d.mode === 'month';
      var fmt = function(v) { if (!v) return '?'; return isMonth ? v.slice(0,7) : v; };
      return '<div class="card-dates">' + (i > 0 ? '再: ' : '') + fmt(d.start) + ' 〜 ' + fmt(d.end) + '</div>';
    }).join('');
    var tagsHTML = (item.tags||[]).map(function(t) { return '<span class="tag">' + escapeHTML(t) + '</span>'; }).join('');
    var typeStr = item.type ? ' / ' + item.type : '';
    var status = item.status || '完了';
    var card;
    if (item.cardType==='mood') { card=makeMoodCard(item); }
    else if (item.cardType==='folder') { card=makeFolderCard(item); }
    else {
      card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="card-photo">'
        + (item.photo
          ? '<img src="' + item.photo + '" alt="">'
          : '<span style="font-size:52px">' + genreIcon(item.genre) + '</span>'
            + '<div class="card-photo-placeholder">' + item.genre + (item.type ? '<br><span style="font-size:9px;opacity:0.7">' + item.type + '</span>' : '') + '</div>')
        + '<span class="card-genre-badge" style="background:' + genreDefaultColor(item.genre) + '">' + escapeHTML(item.genre) + escapeHTML(typeStr) + '</span>'
        + '<span class="status-dot ' + status + '" title="' + status + '"></span>'
        + '</div>'
        + '<div class="card-body">'
        + '<div class="card-title">' + escapeHTML(item.name) + '</div>'
        + '<div class="card-stars">' + starsHTML(item.stars) + '</div>'
        + (tagsHTML ? '<div class="card-tags">' + tagsHTML + '</div>' : '')
        + datesHTML
        + (item.memo ? '<div class="card-memo">' + escapeHTML(item.memo) + '</div>' : '')
        + '</div>';
    }
    card.setAttribute('data-id', String(item.id));
    card.setAttribute('draggable', 'true');
    var check = document.createElement('div');
    check.className = 'select-check'; check.textContent = '✓';
    card.appendChild(check);
    if (selectedIds.has(String(item.id))) card.classList.add('selected');
    grid.appendChild(card);
  }

  // gridのclickイベントは一度だけ登録（renderGridの外）
  el('grid-view').addEventListener('click', function(e) {
    // フォルダー編集ボタン
    if (e.target.classList.contains('folder-edit-btn')) {
      var fid = e.target.getAttribute('data-folder-id');
      if (fid) openFolderModal(fid);
      return;
    }
    // 「外す」ボタン
    if (e.target.classList.contains('folder-remove-btn')) {
      var removeId = e.target.getAttribute('data-remove-id');
      var folder = items.find(function(x){ return String(x.id) === String(currentFolderId); });
      if (folder && removeId) {
        folder.childIds = (folder.childIds||[]).filter(function(c){ return c !== removeId; });
        saveData();
        var ri = items.find(function(x){ return String(x.id) === removeId; });
        showToast((ri ? ri.name : '') + ' を外しました');
        renderGrid();
      }
      return;
    }
    var card = e.target.closest('.card');
    if (!card) return;
    var id = card.getAttribute('data-id');
    if (!id) return;
    if (selectMode) {
      if (selectedIds.has(id)) { selectedIds.delete(id); card.classList.remove('selected'); }
      else { selectedIds.add(id); card.classList.add('selected'); }
      updateBulkBar();
    } else {
      var item = items.find(function(x){ return String(x.id)===String(id); });
      if (item && item.cardType==='mood') { openMoodModal(id); return; }
      if (item && item.cardType==='folder') { openFolderInner(id); return; }
      var numId = parseFloat(id);
      openModal(isNaN(numId) ? id : numId);
    }
  });

  // ===== 年表ビュー =====
  function renderTimeline() {
    el('header-count').textContent = items.length + ' 件';

    var dated = getFiltered().filter(function(x) { return getFirstDate(x); });
    // 重要モードの場合はさらに絞り込み
    if (tlMode === 'important') {
      dated = dated.filter(function(x) { return !!importantIds[x.id]; });
    }
    // 新しい順（降順）
    dated.sort(function(a, b) { return getFirstDate(a) > getFirstDate(b) ? -1 : 1; });

    var grouped = {};
    dated.forEach(function(item) {
      var d = getFirstDate(item).split('-');
      var yr = d[0], mo = parseInt(d[1]);
      if (!grouped[yr]) grouped[yr] = {};
      if (!grouped[yr][mo]) grouped[yr][mo] = [];
      grouped[yr][mo].push(item);
    });

    var content = el('timeline-content');
    content.innerHTML = '';
    // 年も降順
    var years = Object.keys(grouped).sort(function(a,b){return b-a;});

    if (years.length === 0) {
      content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--ink3);"><p style="margin-top:10px;font-size:14px;">日付が入力された作品がありません</p></div>';
      return;
    }

    // 年の目次バー
    var tocBar = document.createElement('div');
    tocBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:0 24px 20px;';
    years.forEach(function(year) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = year;
      btn.style.cssText = 'padding:4px 14px;border:1.5px solid var(--border);border-radius:20px;background:none;font-family:"DM Mono",monospace;font-size:13px;color:var(--ink2);cursor:pointer;transition:all 0.15s;';
      btn.addEventListener('mouseenter', function(){ this.style.background='var(--surface2)'; });
      btn.addEventListener('mouseleave', function(){ this.style.background='none'; });
      btn.addEventListener('click', function() {
        var target = document.getElementById('tl-year-' + year);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      tocBar.appendChild(btn);
    });
    content.appendChild(tocBar);

    years.forEach(function(year) {
      var yearDiv = document.createElement('div');
      yearDiv.id = 'tl-year-' + year;
      yearDiv.style.cssText = 'margin-bottom:8px;scroll-margin-top:60px;';
      var yearLabel = document.createElement('div');
      yearLabel.className = 'tl-year-label';
      yearLabel.textContent = year;
      yearDiv.appendChild(yearLabel);

      // 月も降順
      var months = Object.keys(grouped[year]).map(Number).sort(function(a,b){return b-a;});

      months.forEach(function(month, monthIdx) {
        // カードラッパー生成ロジック（通常・zigzag共通）
        function makeCardWrap(item) {
          var itemColor = item.color || genreDefaultColor(item.genre);
          var dates = getItemDates(item);
          var cardWrap = document.createElement('div');
          cardWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex-shrink:0;';
          var card = document.createElement('div');
          card.className = 'tl-card';
          var typeStr = item.type ? ' / ' + item.type : '';
          var stars = '';
          for (var i = 1; i <= 3; i++) stars += i <= item.stars ? '★' : '☆';
          card.innerHTML = '<div class="tl-card-img">'
            + (item.photo ? '<img src="' + item.photo + '" alt="">' : '<span>' + genreIcon(item.genre) + '</span>')
            + '<div class="tl-card-badge">' + item.genre + typeStr + '</div>'
            + '</div>'
            + '<div class="tl-card-name">' + escapeHTML(item.name) + '</div>'
            + '<div class="tl-card-stars">' + stars + '</div>';
          card.setAttribute('data-id', String(item.id));
          card.addEventListener('click', (function(id) {
            return function() { openModal(id); };
          })(item.id));
          cardWrap.appendChild(card);
          // 期間線
          dates.forEach(function(d) {
            if (!d.start && !d.end) return;
            if (d.mode === 'month') return;
            var hasBoth = d.start && d.end;
            var hasOnlyEnd = !d.start && d.end;
            if (hasBoth) {
              var pl = document.createElement('div');
              pl.className = 'tl-period-line';
              pl.style.cssText = 'background:' + itemColor + ';height:28px;';
              cardWrap.appendChild(pl);
            } else if (hasOnlyEnd) {
              var ps = document.createElement('div');
              ps.className = 'tl-period-line';
              ps.style.cssText = 'background:' + itemColor + ';height:14px;';
              cardWrap.appendChild(ps);
              var pd = document.createElement('div');
              pd.className = 'tl-period-dot-line';
              pd.style.cssText = 'color:' + itemColor + ';height:20px;';
              cardWrap.appendChild(pd);
            }
          });
          return cardWrap;
        }

        if (tlLayout === 'zigzag') {
          // 左右交互レイアウト：偶数月=右、奇数月=左
          var isRight = monthIdx % 2 === 0;

          var row = document.createElement('div');
          row.className = 'tl-zz-row';

          var leftWrap = document.createElement('div');
          leftWrap.className = 'tl-zz-left';

          var centerWrap = document.createElement('div');
          centerWrap.className = 'tl-zz-center';
          var dot = document.createElement('div');
          dot.className = 'tl-zz-dot';
          var mlabel = document.createElement('div');
          mlabel.className = 'tl-zz-month-label';
          mlabel.textContent = month + '月';
          var vline = document.createElement('div');
          vline.className = 'tl-vert-line';
          vline.style.flex = '1';
          centerWrap.appendChild(dot);
          centerWrap.appendChild(mlabel);
          centerWrap.appendChild(vline);

          var rightWrap = document.createElement('div');
          rightWrap.className = 'tl-zz-right';

          grouped[year][month].forEach(function(item) {
            var cw = makeCardWrap(item);
            if (isRight) rightWrap.appendChild(cw);
            else leftWrap.appendChild(cw);
          });

          row.appendChild(leftWrap);
          row.appendChild(centerWrap);
          row.appendChild(rightWrap);
          yearDiv.appendChild(row);

        } else {
          // 通常レイアウト（既存）
          var row = document.createElement('div');
          row.className = 'tl-month-row';
          var mlabel = document.createElement('div');
          mlabel.className = 'tl-month-label';
          mlabel.textContent = month + '月';
          var line = document.createElement('div');
          line.className = 'tl-vert-line';
          var cardsWrap = document.createElement('div');
          cardsWrap.className = 'tl-cards';
          grouped[year][month].forEach(function(item) {
            cardsWrap.appendChild(makeCardWrap(item));
          });
          row.appendChild(mlabel); row.appendChild(line); row.appendChild(cardsWrap);
          yearDiv.appendChild(row);
        }
      });
      content.appendChild(yearDiv);
    });
  }

  // ===== HTMLダウンロード =====
  function downloadTimeline() {
    var dated = items.filter(function(x) { return getFirstDate(x); });
    dated.sort(function(a, b) { return getFirstDate(a) < getFirstDate(b) ? -1 : 1; });
    var grouped = {};
    dated.forEach(function(item) {
      var d = getFirstDate(item).split('-');
      var yr = d[0], mo = parseInt(d[1]);
      if (!grouped[yr]) grouped[yr] = {};
      if (!grouped[yr][mo]) grouped[yr][mo] = [];
      grouped[yr][mo].push(item);
    });

    var body = '';
    Object.keys(grouped).sort().forEach(function(year) {
      body += '<h2>' + year + '</h2>';
      Object.keys(grouped[year]).map(Number).sort(function(a,b){return a-b;}).forEach(function(month) {
        body += '<div style="display:flex;margin-bottom:20px;align-items:flex-start;">';
        body += '<div style="width:50px;text-align:right;padding-right:12px;padding-top:8px;flex-shrink:0;font-family:monospace;font-size:14px;color:#666;">' + month + '月</div>';
        body += '<div style="border-left:2px solid #ccc;padding-left:14px;display:flex;flex-wrap:wrap;gap:10px;">';
        grouped[year][month].forEach(function(item) {
          var stars = '';
          for (var i=1;i<=3;i++) stars += i<=item.stars?'★':'☆';
          body += '<div style="width:100px;border:1px solid #ddd;border-radius:5px;overflow:hidden;background:#fff;">';
          body += item.photo ? '<img src="' + item.photo + '" style="width:100%;height:68px;object-fit:cover;" alt="">' : '<div style="width:100%;height:68px;background:#f0ede5;display:flex;align-items:center;justify-content:center;font-size:28px;">' + '-' + '</div>';
          body += '<div style="padding:5px 6px;font-size:11px;font-weight:bold;line-height:1.3;">' + item.name + '</div>';
          body += '<div style="padding:0 6px 5px;font-size:11px;color:#d4920a;">' + stars + '</div>';
          body += '</div>';
        });
        body += '</div></div>';
      });
    });

    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>作品ログ 年表</title>'
      + '<style>body{font-family:sans-serif;background:#f5f0e8;padding:24px;max-width:900px;margin:0 auto;}h1{font-size:22px;margin-bottom:4px;}h2{font-family:monospace;color:#999;font-size:15px;margin:28px 0 8px;}</style>'
      + '</head><body><h1>作品ログ 年表</h1>'
      + '<p style="font-size:12px;color:#999;margin-bottom:20px;">出力日：' + new Date().toLocaleDateString('ja-JP') + ' / 全 ' + items.length + ' 件</p>'
      + body + '</body></html>';

    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'sakuhin-nenpo.html'; document.body.appendChild(a); a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
  }

  // ===== イベント登録 =====
  // フィルター（ジャンル）複数選択対応
  function updateFilterBtns() {
    document.querySelectorAll('.filter-btn[data-genre]').forEach(function(b) {
      var g = b.getAttribute('data-genre');
      if (g === 'all') {
        b.classList.toggle('active', currentFilter.size === 0);
      } else {
        b.classList.toggle('active', currentFilter.has(g));
      }
    });
  }

  document.querySelectorAll('.filter-btn[data-genre]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var g = btn.getAttribute('data-genre');
      if (g === 'all') {
        // すべてを押したら全解除
        currentFilter = new Set();
      } else {
        // 既に選択済みなら解除、なければ追加
        if (currentFilter.has(g)) {
          currentFilter.delete(g);
        } else {
          currentFilter.add(g);
        }
      }
      updateFilterBtns();
      if (currentView === 'grid') renderGrid(); else renderTimeline();
    });
  });

  // タグドロップダウン
  function getAllTags() {
    var tagSet = {};
    items.forEach(function(item) {
      (item.tags || []).forEach(function(t) { if (t) tagSet[t] = (tagSet[t] || 0) + 1; });
    });
    return Object.keys(tagSet).sort(function(a,b) { return tagSet[b]-tagSet[a]; }).map(function(t) { return { tag: t, count: tagSet[t] }; });
  }

  function renderTagDropdown() {
    var tags = getAllTags();
    var list = el('tag-list');
    list.innerHTML = '';
    if (tags.length === 0) {
      list.innerHTML = '<span style="font-size:12px;color:var(--ink3);">タグがありません</span>';
      return;
    }
    tags.forEach(function(t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      var isActive = currentTagFilter === t.tag;
      btn.style.cssText = 'padding:3px 10px;border-radius:12px;border:1.5px solid ' + (isActive ? 'var(--accent)' : 'var(--border)') + ';background:' + (isActive ? 'var(--accent)' : 'transparent') + ';color:' + (isActive ? '#fff' : 'var(--ink2)') + ';font-size:12px;cursor:pointer;font-family:inherit;transition:all 0.12s;';
      btn.textContent = t.tag + ' ' + t.count;
      btn.addEventListener('click', function() {
        if (currentTagFilter === t.tag) {
          currentTagFilter = null;
          el('tag-filter-btn').classList.remove('active');
        } else {
          currentTagFilter = t.tag;
          el('tag-filter-btn').classList.add('active');
          el('tag-filter-btn').style.background = 'var(--ink)';
          el('tag-filter-btn').style.color = 'var(--bg)';
          el('tag-filter-btn').style.borderColor = 'var(--ink)';
        }
        el('tag-dropdown').style.display = 'none';
        if (currentView === 'grid') renderGrid(); else renderTimeline();
      });
      list.appendChild(btn);
    });
  }

  el('tag-filter-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    var dd = el('tag-dropdown');
    if (dd.style.display === 'none') {
      renderTagDropdown();
      var rect = el('tag-filter-btn').getBoundingClientRect();
      dd.style.top = (rect.bottom + 6) + 'px';
      dd.style.left = Math.max(8, rect.left) + 'px';
      dd.style.display = 'block';
    } else {
      dd.style.display = 'none';
    }
  });

  el('tag-clear-btn').addEventListener('click', function() {
    currentTagFilter = null;
    var btn = el('tag-filter-btn');
    btn.classList.remove('active');
    btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = '';
    el('tag-dropdown').style.display = 'none';
    if (currentView === 'grid') renderGrid(); else renderTimeline();
  });

  // 星フィルター（タップで 0→1→2→3→0 と切り替え）
  el('star-filter-btn').addEventListener('click', function() {
    currentStarFilter = (currentStarFilter + 1) % 4;
    var btn = el('star-filter-btn');
    var labels = ['★', '★以上', '★★以上', '★★★'];
    btn.textContent = labels[currentStarFilter];
    btn.setAttribute('data-stars', currentStarFilter);
    if (currentStarFilter > 0) {
      btn.classList.add('active');
      btn.style.background = '#d4920a';
      btn.style.borderColor = '#d4920a';
      btn.style.color = '#fff';
    } else {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
    if (currentView === 'grid') renderGrid(); else renderTimeline();
  });

  // ドロップダウン外クリックで閉じる
  document.addEventListener('click', function(e) {
    if (!el('tag-filter-btn').contains(e.target) && !el('tag-dropdown').contains(e.target)) {
      el('tag-dropdown').style.display = 'none';
    }
  });

  // ビュー切り替え
  // レイアウト切り替え（通常 / コンパクト）
  function applyLayoutBtns() {
    var btn = el('layout-normal-btn');
    if (btn) {
      btn.textContent = currentLayout === 'normal' ? '▦' : '⊞';
      btn.classList.toggle('active', currentLayout === 'normal');
    }
    var btnm = el('layout-normal-btn-m');
    if (btnm) {
      btnm.textContent = currentLayout === 'normal' ? '▦' : '⊞';
      btnm.classList.toggle('active', currentLayout === 'normal');
    }
  }

  function applyViewBtns(view) {
    var nb = el('nav-list-btn'); if(nb) nb.classList.toggle('active', view==='grid');
    var nt = el('nav-tl-btn'); if(nt) nt.classList.toggle('active', view==='timeline');
  }

  function applySelectBtn(active) {
    var sb = el('select-mode-btn');
    if (active) {
      sb.style.background = 'var(--accent)';
      sb.style.color = '#fff';
      sb.style.borderColor = 'var(--accent)';
    } else {
      sb.style.background = '';
      sb.style.color = '';
      sb.style.borderColor = '';
    }
  }
  applyLayoutBtns();

  el('layout-normal-btn').addEventListener('click', function() {
    currentLayout = currentLayout === 'normal' ? 'compact' : 'normal';
    localStorage.setItem('sakuhin-layout', currentLayout);
    applyLayoutBtns();
    if (currentView === 'grid') renderGrid();
  });

  // view-grid-btn/tl-btnは削除済み → ナビバーのsetPageで管理

  // 並び替え
  el('sort-select').addEventListener('change', function() {
    currentSort = this.value;
    if (currentView === 'grid') renderGrid();
  });

  // ジャンル変更時にデフォルト色を自動セット
  el('f-genre').addEventListener('change', function() {
    el('f-color').value = genreDefaultColor(this.value);
  });

  // 年表モード切替
  el('tl-mode-normal-btn').addEventListener('click', function() {
    tlMode = 'normal';
    el('tl-mode-normal-btn').classList.add('active');
    el('tl-mode-important-btn').classList.remove('active');
    el('tl-important-edit-btn').style.display = 'none';
    renderTimeline();
  });
  el('tl-mode-important-btn').addEventListener('click', function() {
    tlMode = 'important';
    el('tl-mode-important-btn').classList.add('active');
    el('tl-mode-normal-btn').classList.remove('active');
    el('tl-important-edit-btn').style.display = 'inline-block';
    renderTimeline();
  });

  // 年表レイアウト切り替え
  el('tl-layout-normal-btn').addEventListener('click', function() {
    tlLayout = 'normal';
    el('tl-layout-normal-btn').classList.add('active');
    el('tl-layout-zigzag-btn').classList.remove('active');
    renderTimeline();
  });
  el('tl-layout-zigzag-btn').addEventListener('click', function() {
    tlLayout = 'zigzag';
    el('tl-layout-zigzag-btn').classList.add('active');
    el('tl-layout-normal-btn').classList.remove('active');
    renderTimeline();
  });

  // 重要設定モーダルを開く（年表内）
  el('tl-important-edit-btn').addEventListener('click', function() {
    openImportantModal();
  });

  // 重要設定モーダル
  var importantTempIds = {}; // 編集中の一時状態

  function openImportantModal() {
    importantTempIds = Object.assign({}, importantIds);
    var list = el('important-list');
    list.innerHTML = '';
    items.forEach(function(item) {
      var isChecked = !!importantTempIds[item.id];
      var color = item.color || genreDefaultColor(item.genre);
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;';
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = isChecked;
      cb.style.cssText = 'flex-shrink:0;width:16px;height:16px;accent-color:' + color + ';cursor:pointer;';
      cb.addEventListener('change', function() {
        if (cb.checked) importantTempIds[item.id] = true;
        else delete importantTempIds[item.id];
      });
      var dot = document.createElement('span');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0;';
      var name = document.createElement('span');
      name.style.cssText = 'flex:1;';
      name.textContent = item.name;
      var genre = document.createElement('span');
      genre.style.cssText = 'font-size:11px;color:var(--ink3);';
      genre.textContent = item.genre;
      row.appendChild(cb); row.appendChild(dot); row.appendChild(name); row.appendChild(genre);
      list.appendChild(row);
    });
    el('important-modal').classList.add('open');
  }

  el('important-modal-close').addEventListener('click', function() { el('important-modal').classList.remove('open'); });
  el('important-cancel-btn').addEventListener('click', function() { el('important-modal').classList.remove('open'); });
  el('important-save-btn').addEventListener('click', function() {
    importantIds = importantTempIds;
    localStorage.setItem('sakuhin-important', JSON.stringify(importantIds));
    el('important-modal').classList.remove('open');
    renderTimeline();
    showToast('重要の設定を保存しました', 'success');
  });

  // カードモーダルの重要ボタン
  function updateImportantBtn(id) {
    var btn = el('btn-important');
    var isImportant = !!importantIds[id];
    btn.textContent = isImportant ? '★ 重要' : '☆ 重要';
    btn.style.color = isImportant ? '#d4920a' : 'var(--ink2)';
    btn.style.borderColor = isImportant ? '#d4920a' : 'var(--border)';
  }
  el('btn-important').addEventListener('click', function() {
    if (editingId === null) return;
    if (importantIds[editingId]) delete importantIds[editingId];
    else importantIds[editingId] = true;
    localStorage.setItem('sakuhin-important', JSON.stringify(importantIds));
    updateImportantBtn(editingId);
  });

  el('add-genre-btn').addEventListener('click', function() {
    var name = prompt('新しいジャンル名を入力してください');
    if (!name) return;
    name = name.trim();
    if (!name) return;
    if (getAllGenres().indexOf(name) !== -1) {
      showToast('そのジャンルはすでに存在します', 'error'); return;
    }
    var color = genreDefaultColor('その他');
    // カラーピッカーで色を選ぶ
    var colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.value = '#888888';
    colorInput.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(colorInput);
    colorInput.addEventListener('change', function() {
      color = colorInput.value;
      document.body.removeChild(colorInput);
      if (addGenre(name, color)) {
        el('f-genre').value = name;
        el('f-color').value = color;
        showToast('ジャンル「' + name + '」を追加しました', 'success');
      }
    });
    colorInput.addEventListener('input', function() { color = colorInput.value; });
    // promptの後すぐに色選択
    setTimeout(function() { colorInput.click(); }, 100);
  });

  // ===== 一括選択 =====
  // ===== 一括選択 =====
  function enterSelectMode() {
    selectMode = true;
    selectedIds = new Set();
    document.body.classList.add('select-mode');
    applySelectBtn(true);
    el('bulk-bar').classList.add('show');
    el('add-btn').style.display = 'none';
    // フォルダー内: 「外す」表示、「追加」非表示
    if (currentFolderId) {
      el('bulk-remove-folder-btn').style.display = '';
      el('bulk-add-folder-btn').style.display = 'none';
    } else {
      el('bulk-remove-folder-btn').style.display = 'none';
      el('bulk-add-folder-btn').style.display = '';
    }
    updateBulkBar();
  }

  function exitSelectMode() {
    selectMode = false;
    selectedIds = new Set();
    document.body.classList.remove('select-mode');
    applySelectBtn(false);
    el('bulk-bar').classList.remove('show');
    el('add-btn').style.display = '';
    // 選択状態のクラスをリセット
    document.querySelectorAll('.card.selected').forEach(function(c) { c.classList.remove('selected'); });
  }

  function updateBulkBar() {
    el('bulk-count').textContent = selectedIds.size + ' 件選択中';
    document.body.classList.toggle('select-mode', selectMode);
    // ジャンルドロップダウンを更新
    var dd = el('bulk-genre-dropdown');
    dd.innerHTML = '';
    getAllGenres().forEach(function(g) {
      var name = typeof g === 'string' ? g : g.name;
      var btn = document.createElement('button');
      btn.className = 'dmenu-btn';
      btn.textContent = name;
      btn.addEventListener('click', function() {
        dd.style.display = 'none';
        selectedIds.forEach(function(id) {
          for (var i = 0; i < items.length; i++) {
            if (String(items[i].id) === String(id)) { items[i].genre = name; break; }
          }
        });
        _origSaveData();
        showToast(selectedIds.size + ' 件のジャンルを変更しました', 'success');
        exitSelectMode();
      });
      dd.appendChild(btn);
    });
  }

  el('select-mode-btn').addEventListener('click', function() {
    if (selectMode) exitSelectMode(); else enterSelectMode();
  });

  el('bulk-cancel-btn').addEventListener('click', function() { exitSelectMode(); });

  // 選択削除
  el('bulk-delete-btn').addEventListener('click', function() {
    if (!selectedIds.size) { showToast('作品を選択してください', 'error'); return; }
    if (!confirm(selectedIds.size + ' 件を削除しますか？この操作は元に戻せません。')) return;
    var ids = Array.from(selectedIds);
    // フォルダーのchildIdsからも除外
    items.forEach(function(f) {
      if (f.cardType === 'folder') {
        f.childIds = (f.childIds||[]).filter(function(c){ return ids.indexOf(c) === -1; });
      }
    });
    items = items.filter(function(x){ return !selectedIds.has(String(x.id)); });
    saveData();
    showToast(ids.length + ' 件を削除しました');
    exitSelectMode();
    renderGrid();
  });

  el('bulk-all-btn').addEventListener('click', function() {
    var filtered = getFiltered();
    if (selectedIds.size === filtered.length) {
      selectedIds = new Set(); // 全解除
    } else {
      filtered.forEach(function(item) { selectedIds.add(String(item.id)); });
    }
    updateBulkBar();
    renderGrid();
  });

  el('bulk-important-btn').addEventListener('click', function() {
    if (!selectedIds.size) { showToast('作品を選択してください', 'error'); return; }
    var allImportant = true;
    selectedIds.forEach(function(id) { if (!importantIds[id]) allImportant = false; });
    selectedIds.forEach(function(id) {
      if (allImportant) delete importantIds[id]; // 全部重要なら解除
      else importantIds[id] = true;
    });
    localStorage.setItem('sakuhin-important', JSON.stringify(importantIds));
    showToast(selectedIds.size + ' 件の重要を' + (allImportant ? '解除' : '設定') + 'しました', 'success');
    exitSelectMode();
  });

  // 一括星変更
  el('bulk-stars-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    if (!selectedIds.size) { showToast('作品を選択してください', 'error'); return; }
    var dd = el('bulk-stars-dropdown');
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  });
  el('bulk-stars-dropdown').querySelectorAll('button[data-stars]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var stars = parseInt(btn.getAttribute('data-stars'));
      selectedIds.forEach(function(id) {
        for (var i = 0; i < items.length; i++) {
          if (String(items[i].id) === String(id)) { items[i].stars = stars; break; }
        }
      });
      saveData();
      el('bulk-stars-dropdown').style.display = 'none';
      showToast('星を変更: ' + selectedIds.size + ' 件', 'success');
      exitSelectMode();
      renderGrid();
    });
  });
  document.addEventListener('click', function() { el('bulk-stars-dropdown').style.display = 'none'; });

  el('bulk-color-btn').addEventListener('click', function() {
    if (!selectedIds.size) { showToast('作品を選択してください', 'error'); return; }
    el('bulk-color-input').click();
  });
  el('bulk-color-input').addEventListener('change', function() {
    var color = this.value;
    selectedIds.forEach(function(id) {
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].id) === String(id)) { items[i].color = color; break; }
      }
    });
    _origSaveData();
    showToast(selectedIds.size + ' 件のカラーを変更しました', 'success');
    exitSelectMode();
  });

  el('bulk-genre-btn').addEventListener('click', function(e) {
    if (!selectedIds.size) { showToast('作品を選択してください', 'error'); return; }
    e.stopPropagation();
    var dd = el('bulk-genre-dropdown');
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', function() {
    el('bulk-genre-dropdown').style.display = 'none';
  });
  el('bulk-genre-dropdown').addEventListener('click', function(e) { e.stopPropagation(); });



  // スマホパネルのボタンをPC側と同期
  function syncMobileBtns() {
    var sm = el('sort-select-m');
    if (sm) sm.value = currentSort;
    // layout-compact-btn-mは削除済み
    // view-grid-btn-m/tl-m は削除済み
  }

  // スマホパネルのボタンイベント
  var sm = el('sort-select-m');
  if (sm) sm.addEventListener('change', function() {
    currentSort = this.value; el('sort-select').value = this.value;
    if (currentView === 'grid') renderGrid(); else renderTimeline();
  });
  var lbm = el('layout-normal-btn-m');
  if (lbm) lbm.addEventListener('click', function() {
    currentLayout = currentLayout === 'normal' ? 'compact' : 'normal';
    localStorage.setItem('sakuhin-layout', currentLayout);
    applyLayoutBtns();
    if (currentView === 'grid') renderGrid();
  });
  var vgm = el('view-grid-btn-m');
  if (vgm) vgm.addEventListener('click', function() {
    currentView = 'grid'; applyViewBtns('grid'); syncMobileBtns();
    el('grid-view').style.display = 'grid'; el('timeline-view').style.display = 'none';
    el('toolbar-more-panel').classList.remove('open');
    renderGrid();
  });
  var vtm = el('view-tl-btn-m');
  if (vtm) vtm.addEventListener('click', function() {
    currentView = 'timeline'; applyViewBtns('timeline'); syncMobileBtns();
    el('grid-view').style.display = 'none'; el('timeline-view').style.display = 'block';
    el('toolbar-more-panel').classList.remove('open');
    renderTimeline();
  });
  var vsm = el('select-mode-btn-m');
  if (vsm) vsm.addEventListener('click', function() {
    el('toolbar-more-panel').classList.remove('open');
    if (selectMode) exitSelectMode(); else enterSelectMode();
  });
  var vam = el('add-btn-m');
  if (vam) vam.addEventListener('click', function() {
    el('toolbar-more-panel').classList.remove('open');
    el('add-type-modal').classList.add('open');
  });



  el('add-btn').addEventListener('click', function() { el('add-type-modal').classList.add('open'); });
  el('modal-close-btn').addEventListener('click', closeModal);
  el('btn-cancel').addEventListener('click', closeModal);
  el('modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
  el('btn-save').addEventListener('click', saveItem);
  el('btn-delete').addEventListener('click', deleteItem);
  el('add-date-btn').addEventListener('click', function() { addDateRow('', '', 'day'); });
  el('dl-btn').addEventListener('click', downloadTimeline);

  document.querySelectorAll('#star-input button').forEach(function(btn) {
    btn.addEventListener('click', function() { setStar(parseInt(btn.getAttribute('data-val'))); });
  });

  el('f-photo').addEventListener('change', function() {
    var file = this.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      compressImage(e.target.result, function(compressed) {
        photoData = compressed;
        el('photo-preview').src = compressed; el('photo-preview').style.display = 'block';
        el('photo-placeholder').style.display = 'none';
      });
    };
    reader.readAsDataURL(file);
  });

  el('f-memo-photo').addEventListener('change', function() {
    var file = this.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      compressImage(e.target.result, function(compressed) {
        memoPhotoData = compressed;
        el('memo-preview').src = compressed; el('memo-preview').style.display = 'block';
        el('memo-placeholder').style.display = 'none'; el('memo-clear-btn').style.display = 'block';
      });
    };
    reader.readAsDataURL(file);
  });

  el('memo-clear-btn').addEventListener('click', function() {
    memoPhotoData = null;
    el('memo-preview').style.display = 'none'; el('memo-preview').src = '';
    el('memo-placeholder').style.display = 'block'; el('memo-clear-btn').style.display = 'none';
    el('f-memo-photo').value = '';
  });

  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

  // ===== データメニュー =====
  // data-menu-btnは設定ボタンに移管
  document.addEventListener('click', function() { el('data-menu').style.display = 'none'; });
  el('data-menu').addEventListener('click', function(e) { e.stopPropagation(); });

  // エクスポート
  el('export-btn').addEventListener('click', function() {
    el('data-menu').style.display = 'none';
    var json = JSON.stringify(items, null, 2);
    var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var d = new Date();
    a.download = 'sakuhin-log-' + d.getFullYear() + ('0'+(d.getMonth()+1)).slice(-2) + ('0'+d.getDate()).slice(-2) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
  });

  // インポート
  el('import-btn').addEventListener('click', function() {
    el('data-menu').style.display = 'none';
    el('import-file').click();
  });
  el('import-file').addEventListener('change', function() {
    var file = this.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error('invalid');
        if (!confirm(imported.length + ' 件をインポートします。続けますか？')) return;
        smartMerge(items, imported, function(added, skipped, memoMerged) {
          saveData();
          if (currentView === 'grid') renderGrid(); else renderTimeline();
          showToast('追加 ' + added + ' 件・スキップ ' + skipped + ' 件', 'success');
        });
      } catch(err) {
        showToast('インポートに失敗しました', 'error');
      }
    };
    reader.readAsText(file);
    this.value = '';
  });

  // Driveガイド（削除済み）

  // ===== bookmoryインポート =====
  el('bookmory-import-btn').addEventListener('click', function() {
    el('data-menu').style.display = 'none';
    el('bookmory-file').click();
  });

  el('bookmory-file').addEventListener('change', function() {
    var file = this.files[0]; if (!file) return;
    this.value = '';
    var reader = new FileReader();
    reader.onload = function(e) {
      importBookmory(e.target.result);
    };
    reader.readAsArrayBuffer(file);
  });

  function importBookmory(arrayBuffer) {
    showLoading();
    // JSZipでZIPを解凍
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = function() {
      JSZip.loadAsync(arrayBuffer).then(function(zip) {
        var dbFile = zip.file('new_bookmory.db');
        if (!dbFile) dbFile = zip.file('bookmory.db');
        if (!dbFile) { alert('DBファイルが見つかりません'); return; }
        return dbFile.async('arraybuffer');
      }).then(function(dbBuf) {
        // sql.jsでSQLite読み込み
        var s2 = document.createElement('script');
        s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js';
        s2.onload = function() {
          initSqlJs({ locateFile: function(f) { return 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/' + f; } }).then(function(SQL) {
            var db = new SQL.Database(new Uint8Array(dbBuf));

            // books取得
            var books = {};
            var bRes = db.exec("SELECT key, value FROM entry WHERE store='books'");
            if (bRes.length && bRes[0].values) {
              bRes[0].values.forEach(function(row) {
                var key = row[0]; var val = row[1];
                if (typeof key !== 'string') key = new TextDecoder().decode(key);
                try { books[key] = JSON.parse(val); } catch(e) {}
              });
            }

            // notes取得（bid→メモ一覧）
            var notesByBid = {};
            var nRes = db.exec("SELECT key, value FROM entry WHERE store='notes'");
            if (nRes.length && nRes[0].values) {
              nRes[0].values.forEach(function(row) {
                try {
                  var n = JSON.parse(row[1]);
                  var bid = String(n.bid);
                  if (!notesByBid[bid]) notesByBid[bid] = [];
                  // quillのdeltaからテキストを抽出
                  var text = '';
                  try {
                    var ops = JSON.parse(n.book_content || n.content_quill || '[]');
                    ops.forEach(function(op) { if (op.insert && typeof op.insert === 'string') text += op.insert; });
                  } catch(e) { text = ''; }
                  if (text.trim()) notesByBid[bid].push(text.trim());
                } catch(e) {}
              });
            }

            db.close();

            // 作品ログ形式に変換
            var statusMap = { 'DONE':'完了', 'READING':'進行中', 'NOT_STARTED':'未着手', 'PAUSE':'進行中', 'GIVE_UP':'進行中' };
            var starMap = function(s) { if (!s) return 0; if (s <= 1.5) return 1; if (s <= 3) return 2; return 3; };

            var newItems = [];
            Object.keys(books).forEach(function(key) {
              var b = books[key];
              // 既存チェック（タイトルで重複回避）
              var exists = items.some(function(x) { return x.name === b.title; });
              if (exists) return;

              var dates = [];
              if (b.reads && b.reads.length) {
                b.reads.forEach(function(r) {
                  dates.push({
                    start: r.start ? new Date(r.start).toISOString().slice(0,10) : '',
                    end:   r.end   ? new Date(r.end).toISOString().slice(0,10)   : ''
                  });
                });
              }

              var lastRead = b.reads && b.reads.length ? b.reads[b.reads.length-1] : null;
              var star = lastRead ? starMap(lastRead.star) : 0;
              var status = b.status_list && b.status_list.length ? (statusMap[b.status_list[b.status_list.length-1]] || '完了') : '未着手';
              var memo = (notesByBid[key] || []).join('\n\n');

              newItems.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: b.title || '',
                genre: '小説',
                type: b.book_type === 'comic' ? 'マンガ' : '',
                stars: star,
                tags: [],
                dates: dates,
                status: status,
                memo: memo,
                photo: b.image || null,
                memoPhoto: null,
                updatedAt: b.updated_at || Date.now()
              });
            });

            if (newItems.length === 0) { hideLoading(); showToast('インポートできる本が見つかりませんでした', 'error'); return; }
            if (!confirm(newItems.length + ' 冊をインポートします。続けますか？')) { hideLoading(); return; }
            smartMerge(items, newItems, function(added, skipped, memoMerged) {
              saveData();
              if (currentView === 'grid') renderGrid(); else renderTimeline();
              hideLoading();
              showToast('追加 ' + added + ' 件・スキップ ' + skipped + ' 件', 'success');
            });
          });
        };
        document.head.appendChild(s2);
      }).catch(function(e) { hideLoading(); showToast('読み込み失敗: ' + e.message, 'error'); });
    };
    document.head.appendChild(script);
  }

  // ===== Steamインポート =====
  var steamGames = [];

  el('steam-import-btn').addEventListener('click', function() {
    el('data-menu').style.display = 'none';
    el('steam-modal').classList.add('open');
    el('steam-result').style.display = 'none';
    el('steam-import-confirm-btn').style.display = 'none';
    el('steam-json-input').value = '';
    steamGames = [];
    var savedKey = localStorage.getItem('steam-api-key');
    var savedId  = localStorage.getItem('steam-id');
    if (savedKey) el('steam-api-key-input').value = savedKey;
    if (savedId)  el('steam-id-input').value = savedId;
  });
  el('steam-modal-close').addEventListener('click', function() { el('steam-modal').classList.remove('open'); });
  el('steam-cancel-btn').addEventListener('click', function() { el('steam-modal').classList.remove('open'); });

  // JSON貼り付けから読み込む
  el('steam-parse-btn').addEventListener('click', function() {
    var raw = el('steam-json-input').value.trim();
    if (!raw) { showToast('JSONを貼り付けてください', 'error'); return; }
    try {
      var json = JSON.parse(raw);
      // IPlayerService/GetOwnedGames 形式
      var games = null;
      if (json.response && json.response.games) {
        games = json.response.games.map(function(g) {
          return {
            appid: String(g.appid),
            name: g.name || 'Unknown',
            hours: g.playtime_forever ? (g.playtime_forever / 60).toFixed(1) : '0',
            lastPlayed: g.rtime_last_played || 0
          };
        });
      }
      // Steam Replayページのajax形式
      else if (json.games) {
        games = json.games.map(function(g) {
          return {
            appid: String(g.appid || g.app_id || ''),
            name: g.name || g.game_name || 'Unknown',
            hours: g.playtime_forever ? (g.playtime_forever / 60).toFixed(1) : (g.hours || '0'),
            lastPlayed: g.rtime_last_played || 0
          };
        });
      }
      // 配列そのまま
      else if (Array.isArray(json)) {
        games = json.map(function(g) {
          return {
            appid: String(g.appid || g.app_id || ''),
            name: g.name || g.game_name || 'Unknown',
            hours: g.playtime_forever ? (g.playtime_forever / 60).toFixed(1) : (g.hours || '0'),
            lastPlayed: g.rtime_last_played || 0
          };
        });
      }
      if (!games || !games.length) { showToast('ゲームデータが見つかりません', 'error'); return; }
      steamGames = games.filter(function(g) { return g.name && g.name !== 'Unknown'; })
        .sort(function(a,b) { return parseFloat(b.hours) - parseFloat(a.hours); });
      renderSteamList();
      showToast(steamGames.length + ' 件のゲームを読み込みました', 'success');
    } catch(e) {
      showToast('JSONの解析に失敗しました: ' + e.message, 'error');
    }
  });

  el('steam-fetch-btn').addEventListener('click', function() {
    var apiKey = el('steam-api-key-input').value.trim();
    var steamId = el('steam-id-input').value.trim();
    if (!apiKey) { showToast('APIキーを入力してください', 'error'); return; }
    if (!steamId || !/^\d{17}$/.test(steamId)) { showToast('Steam IDは17桁の数字で入力してください', 'error'); return; }

    // 入力を保存
    localStorage.setItem('steam-api-key', apiKey);
    localStorage.setItem('steam-id', steamId);

    el('steam-fetch-btn').textContent = '取得中…';
    el('steam-fetch-btn').disabled = true;
    showLoading();

    // corsproxy.io 経由でSteam API呼び出し
    var apiUrl = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=' + apiKey
      + '&steamid=' + steamId + '&include_appinfo=true&include_played_free_games=true&format=json';

    var proxies = [
      'https://corsproxy.io/?',
      'https://api.allorigins.win/get?url='
    ];

    function tryFetch(idx) {
      if (idx >= proxies.length) {
        hideLoading();
        el('steam-fetch-btn').textContent = '取得する';
        el('steam-fetch-btn').disabled = false;
        el('steam-result').style.display = 'block';
        el('steam-result-msg').textContent = 'APIキーまたはSteam IDを確認してください。';
        showToast('Steamの取得に失敗しました', 'error');
        return;
      }
      var url = proxies[idx] + encodeURIComponent(apiUrl);
      fetch(url).then(function(r) { return r.json(); }).then(function(data) {
        // alloriginsはdata.contents、corsproxy.ioは直接JSON
        var json = data.contents ? JSON.parse(data.contents) : data;
        var games = json.response && json.response.games ? json.response.games : null;
        if (!games) { tryFetch(idx + 1); return; }
        steamGames = games.map(function(g) {
          return {
            appid: String(g.appid),
            name: g.name || 'Unknown',
            hours: g.playtime_forever ? (g.playtime_forever / 60).toFixed(1) : '0',
            lastPlayed: g.rtime_last_played || 0,
            img: g.img_header_url || ''
          };
        }).sort(function(a,b) { return parseFloat(b.hours) - parseFloat(a.hours); });
        renderSteamList();
        hideLoading();
        el('steam-fetch-btn').textContent = '取得する';
        el('steam-fetch-btn').disabled = false;
        showToast(steamGames.length + ' 件のゲームを取得しました', 'success');
      }).catch(function() { tryFetch(idx + 1); });
    }
    tryFetch(0);
  });

  function renderSteamList() {
    var list = el('steam-game-list');
    el('steam-result').style.display = 'block';
    el('steam-result-msg').textContent = steamGames.length + ' 本のゲームが見つかりました。インポートするものを選んでください。';
    el('steam-import-confirm-btn').style.display = 'inline-block';
    el('steam-fetch-btn').style.display = 'none';
    list.innerHTML = '';

    // 既存タイトル
    var existingNames = new Set(items.map(function(x) { return x.name; }));

    steamGames.forEach(function(g, idx) {
      var already = existingNames.has(g.name);
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;';
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !already; cb.setAttribute('data-idx', idx);
      cb.style.cssText = 'flex-shrink:0;';
      var img = document.createElement('img');
      img.src = 'https://media.steampowered.com/steamcommunity/public/images/apps/' + g.appid + '/' + g.appid + '_header.jpg';
      img.style.cssText = 'width:60px;height:28px;object-fit:cover;border-radius:2px;flex-shrink:0;';
      img.onerror = function() { this.style.display='none'; };
      var info = document.createElement('span');
      info.style.cssText = 'flex:1;';
      var lastDate = g.lastPlayed ? new Date(g.lastPlayed * 1000).toLocaleDateString('ja-JP') : '';
      info.innerHTML = g.name + '<span style="color:var(--ink3);font-size:11px;margin-left:6px;">' + g.hours + 'h' + (lastDate ? ' / 最終:' + lastDate : '') + (already ? ' (登録済み)' : '') + '</span>';
      row.appendChild(cb); row.appendChild(img); row.appendChild(info);
      list.appendChild(row);
    });
  }

  el('steam-import-confirm-btn').addEventListener('click', function() {
    var checkboxes = el('steam-game-list').querySelectorAll('input[type=checkbox]:checked');
    var toImport = [];
    checkboxes.forEach(function(cb) {
      var idx = parseInt(cb.getAttribute('data-idx'));
      toImport.push(steamGames[idx]);
    });
    if (!toImport.length) { showToast('選択されたゲームがありません', 'error'); return; }
    if (!confirm(toImport.length + ' 本のゲームをインポートします。重複タイトルは上書き、新規は追加されます。続けますか？')) return;

    var added = 0, updated = 0;
    toImport.forEach(function(g) {
      var dates = [];
      // rtime_last_played があれば最終プレイ日を終了日として入れる
      if (g.lastPlayed) {
        dates = [{ start: '', end: new Date(g.lastPlayed * 1000).toISOString().slice(0, 10) }];
      }
      var newItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: g.name,
        genre: 'ゲーム',
        type: '',
        stars: 0,
        tags: [],
        dates: dates,
        status: parseFloat(g.hours) > 0 ? '完了' : '未着手',
        memo: g.hours + ' 時間プレイ',
        photo: null,
        memoPhoto: null,
        updatedAt: Date.now()
      };
      var idx = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].name === g.name) { idx = i; break; }
      }
      if (idx >= 0) { items[idx] = newItem; updated++; }
      else { items.unshift(newItem); added++; }
    });
    saveData();
    el('steam-modal').classList.remove('open');
    if (currentView === 'grid') renderGrid(); else renderTimeline();
    showToast('追加 ' + added + ' 件・更新 ' + updated + ' 件', 'success');
  });

  // ===== テーマ・カラーカスタマイズ =====
  var THEME_PRESETS = [
    { name: '書庫',       bg:'#15130e', surface:'#211d15', ink:'#f3ede0', accent:'#c9a15a', accent2:'#6f9a8d', header:'#100e0a', border:'#38311f' },
    { name: '深海',       bg:'#0a1420', surface:'#111f2e', ink:'#e7f1f5', accent:'#4fb8c9', accent2:'#c98a4f', header:'#070d15', border:'#1c3040' },
    { name: '森影',       bg:'#0f1811', surface:'#17221a', ink:'#eaf2e9', accent:'#5fae6f', accent2:'#c9a15a', header:'#0a120d', border:'#243529' },
    { name: '深紅',       bg:'#160d0d', surface:'#231414', ink:'#f5e9e5', accent:'#c85a52', accent2:'#7a9b8e', header:'#100909', border:'#3a201f' },
    { name: '紫煙',       bg:'#130f19', surface:'#1e1826', ink:'#efe9f5', accent:'#a385c9', accent2:'#c9a15a', header:'#0d0a12', border:'#2d2438' },
    { name: 'モノクローム', bg:'#121212', surface:'#1c1c1c', ink:'#f2f2f2', accent:'#c9c9c9', accent2:'#8a8a8a', header:'#0a0a0a', border:'#333333' },
  ];

  function mixColor(hexA, hexB, ratio) {
    // hexA を ratio ぶん hexB に近づける（暗いテーマでも明るいテーマでも正しく中間色を作れるように）
    var a = { r: parseInt(hexA.slice(1,3),16), g: parseInt(hexA.slice(3,5),16), b: parseInt(hexA.slice(5,7),16) };
    var b = { r: parseInt(hexB.slice(1,3),16), g: parseInt(hexB.slice(3,5),16), b: parseInt(hexB.slice(5,7),16) };
    var r = Math.round(a.r + (b.r - a.r) * ratio);
    var g = Math.round(a.g + (b.g - a.g) * ratio);
    var bb = Math.round(a.b + (b.b - a.b) * ratio);
    return '#' + [r,g,bb].map(function(v){return ('0'+Math.min(255,Math.max(0,v)).toString(16)).slice(-2);}).join('');
  }

  function applyTheme(t) {
    var r = document.documentElement.style;
    r.setProperty('--bg',      t.bg);
    r.setProperty('--surface', t.surface);
    r.setProperty('--surface2', adjustColor(t.surface, 14));
    r.setProperty('--surface3', adjustColor(t.surface, 26));
    r.setProperty('--ink',     t.ink);
    r.setProperty('--ink2',    mixColor(t.ink, t.bg, 0.30));
    r.setProperty('--ink3',    mixColor(t.ink, t.bg, 0.55));
    r.setProperty('--accent',  t.accent);
    r.setProperty('--accent2', t.accent2 || t.accent);
    r.setProperty('--border',  t.border);
    var header = document.querySelector('header');
    if (header) header.style.background = t.header;
    localStorage.setItem('sakuhin-theme', JSON.stringify(t));
  }

  function adjustColor(hex, amount) {
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    r = Math.min(255, Math.max(0, r + amount));
    g = Math.min(255, Math.max(0, g + amount));
    b = Math.min(255, Math.max(0, b + amount));
    return '#' + [r,g,b].map(function(v){return ('0'+v.toString(16)).slice(-2);}).join('');
  }

  function loadTheme() {
    try {
      var s = localStorage.getItem('sakuhin-theme');
      if (s) {
        var t = JSON.parse(s);
        // 以前の(明るい配色の)保存データが残っていた場合は無視し、新しいデフォルト配色をそのまま使う
        if (t && t.accent2) applyTheme(t);
      }
    } catch(e) {}
  }

  function syncThemeInputs() {
    var t = JSON.parse(localStorage.getItem('sakuhin-theme') || 'null') || THEME_PRESETS[0];
    el('tc-bg').value = t.bg; el('tc-surface').value = t.surface;
    el('tc-ink').value = t.ink; el('tc-accent').value = t.accent;
    el('tc-header').value = t.header; el('tc-border').value = t.border;
  }

  THEME_PRESETS.forEach(function(p) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'padding:6px 14px;border-radius:4px;border:2px solid ' + p.border + ';background:' + p.bg + ';color:' + p.ink + ';font-size:12px;cursor:pointer;font-family:inherit;transition:transform 0.1s;';
    btn.textContent = p.name;
    btn.addEventListener('mouseenter', function() { this.style.transform='scale(1.05)'; });
    btn.addEventListener('mouseleave', function() { this.style.transform=''; });
    btn.addEventListener('click', function() {
      el('tc-bg').value=p.bg; el('tc-surface').value=p.surface;
      el('tc-ink').value=p.ink; el('tc-accent').value=p.accent;
      el('tc-header').value=p.header; el('tc-border').value=p.border;
      applyTheme(p);
    });
    el('theme-presets').appendChild(btn);
  });

  el('theme-btn').addEventListener('click', function() {
    el('data-menu').style.display = 'none';
    syncThemeInputs();
    el('theme-modal').classList.add('open');
  });
  el('theme-modal-close').addEventListener('click', function() { el('theme-modal').classList.remove('open'); });
  el('theme-cancel-btn').addEventListener('click', function() { el('theme-modal').classList.remove('open'); });
  el('theme-save-btn').addEventListener('click', function() {
    applyTheme({ bg:el('tc-bg').value, surface:el('tc-surface').value, ink:el('tc-ink').value, accent:el('tc-accent').value, header:el('tc-header').value, border:el('tc-border').value });
    el('theme-modal').classList.remove('open');
  });
  ['tc-bg','tc-surface','tc-ink','tc-accent','tc-header','tc-border'].forEach(function(id) {
    el(id).addEventListener('input', function() {
      applyTheme({ bg:el('tc-bg').value, surface:el('tc-surface').value, ink:el('tc-ink').value, accent:el('tc-accent').value, header:el('tc-header').value, border:el('tc-border').value });
    });
  });
  el('theme-reset-btn').addEventListener('click', function() {
    localStorage.removeItem('sakuhin-theme');
    applyTheme(THEME_PRESETS[0]);
    syncThemeInputs();
  });

  loadTheme();

  // ===== Google Drive 連携 =====
  var _origSaveData = saveData; // フック前のsaveDataを保持
  var CLIENT_ID = '586982625413-hto13tgg5sasgh4cdmvh8jibb7kbs2va.apps.googleusercontent.com';
  var SCOPES = 'https://www.googleapis.com/auth/drive.file';
  var DRIVE_FILE_NAME = 'sakuhin-log-data.json';
  var driveFileId = localStorage.getItem('drive-file-id') || null;
  var tokenClient = null;
  var accessToken = null;
  var driveLoggedIn = false;

  function driveSetStatus(msg, type) {
    var s = el('drive-status');
    s.textContent = msg; s.style.display = msg ? 'block' : 'none';
    if (!msg) { hideLoading(); return; }
    if (msg.indexOf('中…') !== -1) { showLoading(); }
    else {
      hideLoading();
      if (msg.indexOf('失敗') !== -1 || msg.indexOf('エラー') !== -1) showToast(msg, 'error');
      else showToast(msg, type || 'success');
    }
  }

  function driveSetLoggedIn(loggedIn) {
    driveLoggedIn = loggedIn;
    el('drive-login-btn').style.display  = loggedIn ? 'none'  : 'block';
    el('drive-save-btn').style.display   = loggedIn ? 'block' : 'none';
    el('drive-load-btn').style.display   = loggedIn ? 'block' : 'none';
    el('drive-logout-btn').style.display = loggedIn ? 'block' : 'none';
    syncSettingsDriveUI();
    if (currentPage === 'settings') renderSettingsGenre();
  }

  function initGoogleAuth() {
    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(initGoogleAuth, 600); return;
    }
    if (tokenClient) return; // 二重初期化防止
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: function(resp) {
        if (resp.error) {
          driveSetStatus('ログイン失敗: ' + resp.error);
          return;
        }
        accessToken = resp.access_token;
        localStorage.setItem('drive-logged-in', '1');
        driveSetLoggedIn(true);
        driveSetStatus('ログイン済み');
        // ログイン後：Driveを検索して同期
        driveFileId = null; // 毎回再検索
        driveFindFile(function() {
          if (driveFileId) {
            driveLoadRaw(function(loaded) {
              if (loaded && loaded.length > 0 && items.length === 0) {
                items = loaded; _origSaveData();
                if (currentView === 'grid') renderGrid(); else renderTimeline();
                driveSetStatus('Driveから同期: ' + loaded.length + ' 件');
              } else {
                driveSaveRaw(function(ok) {
                  driveSetStatus(ok ? '同期完了' : 'Drive保存失敗');
                });
              }
            });
          } else {
            driveSaveRaw(function(ok) {
              driveSetStatus(ok ? '初回保存完了' : 'Drive保存失敗');
            });
          }
        });
      }
    });
    if (localStorage.getItem('drive-logged-in') === '1') {
      driveSetLoggedIn(true);
      driveSetStatus('ログイン済み');
    }
  }

  el('drive-login-btn').addEventListener('click', function() {
    if (!tokenClient) {
      initGoogleAuth();
      setTimeout(function() {
        if (tokenClient) tokenClient.requestAccessToken();
      }, 800);
      return;
    }
    tokenClient.requestAccessToken();
  });

  el('drive-logout-btn').addEventListener('click', function() {
    if (accessToken && typeof google !== 'undefined') {
      try { google.accounts.oauth2.revoke(accessToken, function() {}); } catch(e) {}
    }
    accessToken = null; driveFileId = null;
    localStorage.removeItem('drive-file-id');
    localStorage.removeItem('drive-logged-in');
    driveSetLoggedIn(false); driveSetStatus('');
  });

  el('drive-save-btn').addEventListener('click', function() {
    el('data-menu').style.display = 'none';
    if (!accessToken) {
      // トークンなし → 再ログインを促す
      if (tokenClient) {
        driveSetStatus('再認証中…');
        tokenClient.requestAccessToken();
      } else {
        driveSetStatus('ログインしてください');
      }
      return;
    }
    driveSetStatus('保存中…');
    driveFindFile(function() {
      driveSaveRaw(function(ok) {
        driveSetStatus(ok ? '保存しました: ' + new Date().toLocaleString('ja-JP') : '保存失敗');
      });
    });
  });

  el('drive-load-btn').addEventListener('click', function() {
    el('data-menu').style.display = 'none';
    if (!accessToken) {
      if (tokenClient) {
        driveSetStatus('再認証中…');
        tokenClient.requestAccessToken();
      } else {
        driveSetStatus('ログインしてください');
      }
      return;
    }
    driveSetStatus('読み込み中…');
    driveFileId = null;
    localStorage.removeItem('drive-file-id');
    driveFindFile(function() {
      if (!driveFileId) { driveSetStatus('Driveにデータが見つかりません'); return; }
      driveLoadRaw(function(loaded) {
        if (!loaded) { driveSetStatus('読み込み失敗'); return; }
        // genres復元（Drive新形式対応）
        if (loaded.genres && loaded.genres.length > 0) {
          customGenres = loaded.genres;
          saveGenres();
          rebuildGenreUI();
          if (currentPage === 'settings') renderSettingsGenre();
        }
        var loadedItems = loaded.items || loaded;
        if (!confirm('Driveのデータ（' + loadedItems.length + ' 件）をマージしますか？\n重複は上書きせず、新規のみ追加されます。')) { driveSetStatus(''); return; }
        smartMerge(items, loadedItems, function(added, skipped, memoMerged) {
          _origSaveData();
          if (currentView === 'grid') renderGrid(); else renderTimeline();
          driveSetStatus('マージ完了: 追加 ' + added + ' 件・スキップ ' + skipped + ' 件');
        });
      });
    });
  });

  function driveFindFile(cb) {
    if (driveFileId) { if (cb) cb(); return; }
    var saved = localStorage.getItem('drive-file-id');
    if (saved) { driveFileId = saved; if (cb) cb(); return; }
    if (!accessToken) { if (cb) cb(); return; }
    var q = encodeURIComponent("name='" + DRIVE_FILE_NAME + "' and trashed=false");
    fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name)&spaces=drive', {
      headers: { Authorization: 'Bearer ' + accessToken }
    }).then(function(r) {
      if (r.status === 401) { accessToken = null; if (cb) cb(); return null; }
      return r.json();
    }).then(function(data) {
      if (data && data.files && data.files.length > 0) {
        driveFileId = data.files[0].id;
        localStorage.setItem('drive-file-id', driveFileId);
      }
      if (cb) cb();
    }).catch(function() { if (cb) cb(); });
  }

  function driveSaveRaw(cb) {
    if (!accessToken) { if (cb) cb(false); return; }
    var content = JSON.stringify(items);
    var boundary = 'sakuhinlog_boundary_2024';
    var meta = JSON.stringify({ name: DRIVE_FILE_NAME });
    var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + meta + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + content + '\r\n--' + boundary + '--';
    var url = driveFileId
      ? 'https://www.googleapis.com/upload/drive/v3/files/' + driveFileId + '?uploadType=multipart'
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    fetch(url, {
      method: driveFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'multipart/related; boundary="' + boundary + '"'
      },
      body: body
    }).then(function(r) {
      if (r.status === 401) { accessToken = null; if (cb) cb(false); return null; }
      return r.json();
    }).then(function(data) {
      if (!data) return;
      if (data.id) {
        driveFileId = data.id;
        localStorage.setItem('drive-file-id', driveFileId);
        localStorage.setItem('drive-logged-in', '1');
      }
      if (cb) cb(!data.error);
    }).catch(function() { if (cb) cb(false); });
  }

  function driveLoadRaw(cb) {
    if (!driveFileId || !accessToken) { if (cb) cb(null); return; }
    fetch('https://www.googleapis.com/drive/v3/files/' + driveFileId + '?alt=media', {
      headers: { Authorization: 'Bearer ' + accessToken }
    }).then(function(r) {
      if (r.status === 401) { accessToken = null; if (cb) cb(null); return null; }
      return r.text();
    }).then(function(text) {
      if (!text) return;
      try {
        var data = JSON.parse(text);
        if (cb) cb(Array.isArray(data) ? data : null);
      } catch(e) { if (cb) cb(null); }
    }).catch(function() { if (cb) cb(null); });
  }

  // saveDataをフックして自動保存
  saveData = function() {
    _origSaveData();
    if (accessToken && driveLoggedIn) {
      driveFindFile(function() {
        driveSaveRaw(function(ok) {
          if (ok) driveSetStatus('自動保存: ' + new Date().toLocaleTimeString('ja-JP'));
        });
      });
    }
  };

  window.addEventListener('load', function() { setTimeout(initGoogleAuth, 800); });

  // ===== PWA: Service Worker登録 =====
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sakuhin-log/sw.js').catch(function() {});
  }



  // ===== ホーム画面 =====
  function renderHome() {
    var container = el('home-daily');
    container.innerHTML = '';

    var today = new Date();
    var seed = today.getFullYear() * 10000 + (today.getMonth()+1) * 100 + today.getDate();
    function seededRand(s) { var x=Math.sin(s)*10000; return x-Math.floor(x); }

    var normalItems = items.filter(function(x){
      return x.cardType !== 'music' && x.cardType !== 'mood' && x.cardType !== 'folder';
    });

    // ===== 挨拶・日付 =====
    var days = ['日','月','火','水','木','金','土'];
    var h = today.getHours();
    var greetText = h < 12 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'こんばんは';
    var greeting = document.createElement('div');
    greeting.className = 'home-greeting';
    greeting.textContent = greetText;
    container.appendChild(greeting);
    var dateLabel = document.createElement('div');
    dateLabel.className = 'home-date-label';
    dateLabel.textContent = today.getFullYear() + '年' + (today.getMonth()+1) + '月' + today.getDate() + '日（' + days[today.getDay()] + '）';
    container.appendChild(dateLabel);

    // ===== 今日のピックアップ（挨拶の直下・合計3枚） =====
    var genreMap = {};
    normalItems.forEach(function(item){
      var g = item.genre||'その他';
      if (!genreMap[g]) genreMap[g] = [];
      genreMap[g].push(item);
    });
    var genres = Object.keys(genreMap).filter(function(g){ return genreMap[g].length>0; });

    if (genres.length > 0) {
      var pickupSec = document.createElement('div');
      pickupSec.className = 'home-section';
      var pickupHeader = document.createElement('div');
      pickupHeader.className = 'home-section-header';
      pickupHeader.innerHTML = '<span class="home-section-title">今日のピックアップ</span>'
        + '<span class="home-section-sub">毎日更新</span>';
      pickupSec.appendChild(pickupHeader);

      // ジャンルをシャッフルして3つ選ぶ
      var shuffled = genres.slice();
      for (var i=shuffled.length-1;i>0;i--){
        var j=Math.floor(seededRand(seed+i)*(i+1));
        var tmp=shuffled[i]; shuffled[i]=shuffled[j]; shuffled[j]=tmp;
      }
      var selected = shuffled.slice(0, Math.min(3, shuffled.length));

      // 各ジャンルから1枚ずつ選んで横に並べる
      var row = document.createElement('div');
      row.className = 'home-cards-row';

      selected.forEach(function(genre, gi) {
        var cards = genreMap[genre].slice();
        for (var i=cards.length-1;i>0;i--){
          var j=Math.floor(seededRand(seed+gi*100+i)*(i+1));
          var tmp=cards[i]; cards[i]=cards[j]; cards[j]=tmp;
        }
        var item = cards[0]; // 1枚だけ
        var color = genreDefaultColor(genre);
        var card = document.createElement('div');
        card.className = 'home-card';
        card.style.width = '140px';
        card.style.transition = 'none';
        card.innerHTML = '<div class="home-card-img" style="height:90px;">'
          + (item.photo?'<img src="'+item.photo+'" alt="">':'<span>'+genreIcon(item.genre)+'</span>')
          + '</div>'
          + '<div style="padding:3px 7px 2px;display:flex;align-items:center;gap:4px;">'
          + '<span style="width:6px;height:6px;border-radius:50%;background:'+color+';flex-shrink:0;display:inline-block;"></span>'
          + '<span style="font-size:10px;color:var(--ink3);">'+escapeHTML(genre)+'</span>'
          + '</div>'
          + '<div class="home-card-name">'+escapeHTML(item.name)+'</div>'
          + '<div class="home-card-stars">'+starsHTML(item.stars)+'</div>';
        card.addEventListener('click', (function(id){ return function(){ openModal(id); }; })(item.id));
        row.appendChild(card);
      });
      pickupSec.appendChild(row);
      container.appendChild(pickupSec);
    }

    // ===== 今月の統計 =====
    var thisYear = today.getFullYear(), thisMonth = today.getMonth();
    var monthlyItems = normalItems.filter(function(x){
      var d = new Date(x.updatedAt || 0);
      return d.getFullYear()===thisYear && d.getMonth()===thisMonth;
    });
    var totalStars = monthlyItems.reduce(function(s,x){ return s+(x.stars||0); }, 0);
    var completedCount = monthlyItems.filter(function(x){ return x.status==='完了'; }).length;

    var statsRow = document.createElement('div');
    statsRow.className = 'home-stats-row home-section';
    [
      { num: monthlyItems.length, label: '今月追加' },
      { num: completedCount,      label: '今月完了' },
      { num: totalStars,          label: '獲得した星' },
    ].forEach(function(s) {
      var card = document.createElement('div');
      card.className = 'home-stat-card';
      card.innerHTML = '<div class="home-stat-num">'+s.num+'</div>'
        + '<div class="home-stat-label">'+s.label+'</div>';
      statsRow.appendChild(card);
    });
    container.appendChild(statsRow);

    // ===== 今月追加したカード一覧 =====
    if (monthlyItems.length > 0) {
      var monthSec = document.createElement('div');
      monthSec.className = 'home-section';
      var monthHeader = document.createElement('div');
      monthHeader.className = 'home-section-header';
      monthHeader.innerHTML = '<span class="home-section-title">今月追加した作品</span>'
        + '<span class="home-section-sub">'+(today.getMonth()+1)+'月</span>';
      monthSec.appendChild(monthHeader);
      var sortedMonthly = monthlyItems.slice().sort(function(a,b){ return (b.updatedAt||0)-(a.updatedAt||0); });
      sortedMonthly.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'home-monthly-item';
        var color = genreDefaultColor(item.genre||'その他');
        var d = new Date(item.updatedAt||0);
        var dateStr = (d.getMonth()+1)+'/'+d.getDate();
        row.innerHTML = '<span class="home-monthly-dot" style="background:'+color+'"></span>'
          + '<span class="home-monthly-name">'+escapeHTML(item.name)+'</span>'
          + '<span class="home-monthly-genre">'+escapeHTML(item.genre||'')+'</span>'
          + '<span class="home-monthly-date">'+dateStr+'</span>';
        row.addEventListener('click', (function(id){ return function(){ openModal(id); setPage('list'); }; })(item.id));
        monthSec.appendChild(row);
      });
      container.appendChild(monthSec);
    }

    if (normalItems.length === 0) {
      container.innerHTML += '<p class="home-empty">作品を追加するとここに表示されます</p>';
    }
  }


  function renderSettingsPage() {
    // バージョン表示
    var vl = el('settings-version-label');
    if (vl) vl.textContent = 'v3.5.0';

    // Drive状態を反映
    el('settings-drive-login-btn').style.display = driveLoggedIn ? 'none' : 'block';
    el('settings-drive-save-btn').style.display = driveLoggedIn ? 'block' : 'none';
    el('settings-drive-load-btn').style.display = driveLoggedIn ? 'block' : 'none';
    el('settings-drive-logout-btn').style.display = driveLoggedIn ? 'block' : 'none';

    // ジャンル一覧
    var list = el('genre-manage-list');
    list.innerHTML = '';
    var allG = getAllGenres();
    allG.forEach(function(g) {
      var name = typeof g === 'string' ? g : g.name;
      var color = genreDefaultColor(name);
      var count = items.filter(function(x){ return x.genre === name; }).length;
      var isDefault = DEFAULT_GENRES.indexOf(name) !== -1;
      var row = document.createElement('div');
      row.className = 'genre-manage-row';
      row.innerHTML = '<span class="genre-manage-dot" style="background:'+color+'"></span>'
        + '<span class="genre-manage-name">'+escapeHTML(name)+'</span>'
        + '<span class="genre-manage-count">'+count+'件</span>';
      var delBtn = document.createElement('button');
      delBtn.className = 'genre-manage-del' + (isDefault ? ' disabled' : '');
      delBtn.textContent = '×';
      delBtn.title = isDefault ? 'デフォルトジャンルは削除できません' : '削除';
      if (!isDefault) {
        delBtn.addEventListener('click', function() {
          if (count > 0 && !confirm('「'+name+'」を削除します。このジャンルの'+count+'件の作品はジャンルが空になります。続けますか？')) return;
          customGenres = customGenres.filter(function(cg){ return (typeof cg==='string'?cg:cg.name) !== name; });
          saveGenres();
          rebuildGenreUI();
          renderSettingsPage();
          showToast('ジャンル「'+name+'」を削除しました');
        });
      }
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  // ============================================================
  // v3 関数定義
  // ============================================================

  function refreshFolderSelect(val) {
    var sel = el('f-folder-select'); if(!sel) return;
    sel.innerHTML = '<option value="">（なし）</option>';
    items.filter(function(x){return x.cardType==='folder';}).forEach(function(f){
      var o=document.createElement('option'); o.value=String(f.id); o.textContent=f.name; sel.appendChild(o);
    });
    sel.value = val || '';
  }

  function makeMoodCard(item) {
    var color = item.color||'#6a8cc4';
    var dates = getItemDates(item);
    var dH = dates.map(function(d){
      var fmt=function(v){return !v?'?':(d.mode==='month'?v.slice(0,7):v);};
      return '<div class="card-dates">'+fmt(d.start)+' 〜 '+fmt(d.end)+'</div>';
    }).join('');
    var c=document.createElement('div'); c.className='card mood-card';
    c.innerHTML='<div class="card-photo" style="background:'+color+'22;display:flex;align-items:center;justify-content:center;min-height:80px;">'
      +'<div style="width:56px;height:56px;border-radius:50%;background:'+color+';opacity:0.85;"></div>'
      +'</div>'
      +'<div class="card-body"><div class="card-title">'+escapeHTML(item.name||'ムード')+'</div>'+dH
      +(item.memo?'<div class="card-memo">'+escapeHTML(item.memo)+'</div>':'')+'</div>';
    return c;
  }

  function makeFolderCard(item) {
    var cids=item.childIds||[];
    var citems=cids.map(function(id){return items.find(function(x){return String(x.id)===String(id);});}).filter(Boolean).slice(0,4);
    var c=document.createElement('div'); c.className='card folder-card';
    var photoEl='';
    var coverImg = item.coverPhoto || null;
    if (coverImg) {
      // カスタムカバー画像
      photoEl = '<img src="'+coverImg+'" style="width:100%;height:100%;object-fit:cover;" alt="">';
    } else if (citems.length === 0) {
      photoEl = '<div style="width:100%;height:100%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:32px;">📁</div>';
    } else if (citems.length === 1) {
      var ci=citems[0];
      photoEl = ci.photo
        ? '<img src="'+ci.photo+'" style="width:100%;height:100%;object-fit:cover;" alt="">'
        : '<div style="width:100%;height:100%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:40px;">'+genreIcon(ci.genre)+'</div>';
    } else if (citems.length === 2) {
      var makeCell2 = function(ci) {
        return ci.photo
          ? '<div style="flex:1;overflow:hidden;"><img src="'+ci.photo+'" style="width:100%;height:100%;object-fit:cover;" alt=""></div>'
          : '<div style="flex:1;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:28px;">'+genreIcon(ci.genre)+'</div>';
      };
      photoEl = '<div style="display:flex;flex-direction:column;width:100%;height:100%;gap:1px;background:var(--border);">'
        + makeCell2(citems[0]) + makeCell2(citems[1]) + '</div>';
    } else if (citems.length === 3) {
      var makeCell3 = function(ci, style) {
        return ci.photo
          ? '<div style="'+style+';overflow:hidden;"><img src="'+ci.photo+'" style="width:100%;height:100%;object-fit:cover;" alt=""></div>'
          : '<div style="'+style+';background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:24px;">'+genreIcon(ci.genre)+'</div>';
      };
      photoEl = '<div style="display:flex;flex-direction:column;width:100%;height:100%;gap:1px;background:var(--border);">'
        + '<div style="display:flex;flex:1;gap:1px;">'
        + makeCell3(citems[0],'flex:1') + makeCell3(citems[1],'flex:1')
        + '</div>'
        + makeCell3(citems[2],'flex:1.4')
        + '</div>';
    } else {
      var cells='';
      for(var i=0;i<4;i++){
        var ci=citems[i];
        if(ci&&ci.photo) cells+='<div class="folder-grid-cell"><img src="'+ci.photo+'" alt=""></div>';
        else if(ci) cells+='<div class="folder-grid-cell">'+genreIcon(ci.genre)+'</div>';
        else cells+='<div class="folder-grid-cell" style="background:var(--border);"></div>';
      }
      photoEl = '<div class="folder-grid">'+cells+'</div>';
    }
    c.innerHTML='<div class="card-photo" style="position:relative;">'
      +photoEl
      +(cids.length?'<span class="folder-count-badge">'+cids.length+'件</span>':'')
      +'<button class="folder-edit-btn" data-folder-id="'+String(item.id)+'" title="編集">⚙</button>'
      +'</div>'
      +'<div class="card-body"><div class="card-title">📁 '+escapeHTML(item.name)+'</div>'
      +'<div class="card-stars">'+starsHTML(item.stars)+'</div>'
      +(item.detail?'<div style="font-size:11px;color:var(--ink3);margin-top:2px;">'+escapeHTML(item.detail)+'</div>':'')
      +'</div>';
    return c;
  }

  function openFolderInner(id) {
    currentFolderId=id;
    var f=items.find(function(x){return String(x.id)===String(id);});
    el('folder-breadcrumb').className='show';
    el('folder-name-label').textContent=f?f.name:'';
    renderGrid();
  }

  function closeFolderInner() {
    currentFolderId=null;
    el('folder-breadcrumb').className='';
    renderGrid();
  }

  var PAGE_TITLES = { list:'一覧', home:'ホーム', timeline:'年表', settings:'設定' };
  function setPage(page) {
    currentPage=page;
    var pt = el('page-title'); if (pt) pt.textContent = PAGE_TITLES[page] || '';
    ['nav-list-btn','nav-home-btn','nav-tl-btn','nav-settings-btn'].forEach(function(id){
      var b=el(id); if(b) b.classList.remove('active');
    });
    el('grid-view').style.display='none';
    el('timeline-view').style.display='none';
    el('home-view').style.display='none';
    var sv=el('settings-view'); if(sv) sv.style.display='none';
    el('count-bar').style.display='none';
    document.querySelector('.toolbar').style.display='none';
    if(page==='list'){
      var b=el('nav-list-btn'); if(b) b.classList.add('active');
      document.querySelector('.toolbar').style.display='';
      el('count-bar').style.display='block';
      el('grid-view').style.display='';
      currentView='grid'; applyViewBtns('grid'); renderGrid();
    } else if(page==='home'){
      var b=el('nav-home-btn'); if(b) b.classList.add('active');
      el('home-view').style.display='block';
      renderHome();
    } else if(page==='timeline'){
      var b=el('nav-tl-btn'); if(b) b.classList.add('active');
      document.querySelector('.toolbar').style.display='';
      el('count-bar').style.display='block';
      el('timeline-view').style.display='block';
      currentView='timeline'; applyViewBtns('timeline'); renderTimeline();
    } else if(page==='settings'){
      var b=el('nav-settings-btn'); if(b) b.classList.add('active');
      var sv=el('settings-view'); if(sv) sv.style.display='block';
      var vl=el('version-label'), sl=el('settings-version-label');
      if(vl&&sl) sl.textContent=vl.textContent;
      syncSettingsDriveUI();
      renderSettingsGenre();
    }
  }

  function openMoodModal(id) {
    moodEditingId=id||null;
    var item=id?items.find(function(x){return String(x.id)===String(id);}):null;
    el('mood-modal-title').textContent=item?'ムードを編集':'ムードを追加';
    el('mood-name').value=item?(item.name||''):'';
    el('mood-color').value=item?(item.color||'#6a8cc4'):'#6a8cc4';
    el('mood-memo').value=item?(item.memo||''):'';
    var list=el('mood-date-list'); list.innerHTML='';
    var dates=item?getItemDates(item):[{start:'',end:''}];
    if(!dates.length) dates=[{start:'',end:''}];
    dates.forEach(function(d){
      var row=document.createElement('div'); row.className='date-row';
      var s=document.createElement('input'); s.type='date'; s.className='date-start'; s.value=d.start||'';
      var sep=document.createElement('span'); sep.className='date-sep'; sep.textContent='〜';
      var e=document.createElement('input'); e.type='date'; e.className='date-end'; e.value=d.end||'';
      var rm=document.createElement('button'); rm.type='button'; rm.className='date-remove'; rm.textContent='×';
      rm.addEventListener('click',function(){row.remove();});
      row.appendChild(s); row.appendChild(sep); row.appendChild(e); row.appendChild(rm);
      list.appendChild(row);
    });
    el('mood-delete-btn').style.display=item?'inline-block':'none';
    el('mood-modal').classList.add('open');
  }

  function saveMoodItem() {
    var dates=[];
    document.querySelectorAll('#mood-date-list .date-row').forEach(function(r){
      var s=r.querySelector('.date-start').value, e=r.querySelector('.date-end').value;
      if(s||e) dates.push({start:s,end:e,mode:'day'});
    });
    var item={id:moodEditingId||Date.now(),cardType:'mood',name:el('mood-name').value.trim()||'ムード',color:el('mood-color').value,memo:el('mood-memo').value.trim(),dates:dates,updatedAt:Date.now()};
    if(moodEditingId){for(var i=0;i<items.length;i++){if(String(items[i].id)===String(moodEditingId)){items[i]=item;break;}}}
    else items.unshift(item);
    saveData(); el('mood-modal').classList.remove('open'); renderGrid();
    showToast('ムードを保存しました','success');
  }

  function setFolderStar(val) {
    folderStar=val;
    document.querySelectorAll('#folder-star-input button').forEach(function(b,i){b.textContent=i<val?'★':'☆'; b.style.color=i<val?'#d4920a':'#aaa';});
  }

  var folderCoverData = null;
  function openFolderModal(id) {
    folderEditingId=id||null;
    folderCoverData=null;
    var item=id?items.find(function(x){return String(x.id)===String(id);}):null;
    el('folder-modal-title').textContent=item?'フォルダーを編集':'フォルダーを作成';
    el('folder-name-input').value=item?item.name:'';
    el('folder-detail').value=item?(item.detail||''):'';
    setFolderStar(item?(item.stars||0):0);
    // カバー画像
    if (item && item.coverPhoto) {
      folderCoverData = item.coverPhoto;
      el('folder-cover-preview').src = item.coverPhoto;
      el('folder-cover-preview').style.display = 'block';
      el('folder-cover-placeholder').style.display = 'none';
      el('folder-cover-clear').style.display = 'block';
    } else {
      el('folder-cover-preview').src = '';
      el('folder-cover-preview').style.display = 'none';
      el('folder-cover-placeholder').style.display = 'block';
      el('folder-cover-clear').style.display = 'none';
    }
    el('folder-cover-file').value = '';
    el('folder-delete-btn').style.display=item?'inline-block':'none';
    el('folder-modal').classList.add('open');
  }

  function saveFolderItem() {
    var name=el('folder-name-input').value.trim();
    if(!name){showToast('フォルダー名を入力してください','error');return;}
    var ex=folderEditingId?items.find(function(x){return String(x.id)===String(folderEditingId);}):null;
    var item={id:folderEditingId||Date.now(),cardType:'folder',name:name,detail:el('folder-detail').value.trim(),stars:folderStar,childIds:ex?(ex.childIds||[]):[],coverPhoto:folderCoverData||null,updatedAt:Date.now()};
    if(folderEditingId){for(var i=0;i<items.length;i++){if(String(items[i].id)===String(folderEditingId)){items[i]=item;break;}}}
    else items.unshift(item);
    saveData(); el('folder-modal').classList.remove('open'); refreshFolderSelect(''); renderGrid();
    showToast('フォルダーを保存しました','success');
  }

  // ============================================================
  // v3 イベント登録
  // ============================================================
  el('nav-list-btn').addEventListener('click', function(){ setPage('list'); });

  // ===== スマホ用編集・絞り込みボタン =====

  // 編集ボタン → ミニパネル
  el('sm-edit-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    var panel = el('edit-mini-panel');
    var btn = el('sm-edit-btn');
    var rect = btn.getBoundingClientRect();
    panel.style.top = (rect.bottom + 6) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.classList.toggle('open');
  });
  document.addEventListener('click', function(e) {
    if (!el('edit-mini-panel').contains(e.target) && e.target !== el('sm-edit-btn')) {
      el('edit-mini-panel').classList.remove('open');
    }
  });

  // ミニパネルの追加・選択
  el('sm-add-btn').addEventListener('click', function() {
    el('edit-mini-panel').classList.remove('open');
    el('add-type-modal').classList.add('open');
  });
  el('sm-select-btn').addEventListener('click', function() {
    el('edit-mini-panel').classList.remove('open');
    if (selectMode) exitSelectMode(); else enterSelectMode();
  });

  // 絞り込みボタン → シート
  el('genre-filter-open-btn').addEventListener('click', function() {
    renderFilterSheet();
    el('filter-sheet-modal').classList.add('open');
  });
  el('filter-sheet-modal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
  el('fs-close-btn').addEventListener('click', function() {
    el('filter-sheet-modal').classList.remove('open');
  });

  // シート内の並び替えボタン
  ['default','name','lastdate','stars_desc','stars_asc'].forEach(function(s) {
    var id = 'fs-sort-' + s.replace('_','-');
    var b = el(id); if (!b) return;
    b.addEventListener('click', function() {
      currentSort = s;
      el('sort-select').value = s;
      // アクティブ状態更新
      ['default','name','lastdate','stars_desc','stars_asc'].forEach(function(ss) {
        var bb = el('fs-sort-' + ss.replace('_','-'));
        if (bb) bb.classList.toggle('active', ss === s);
      });
      if (currentView === 'grid') renderGrid(); else renderTimeline();
    });
  });

  // シート内のジャンルボタンを生成する関数
  function renderFilterSheet() {
    var row = el('fs-genre-row');
    row.innerHTML = '';
    // すべてボタン
    var allBtn = document.createElement('button');
    allBtn.className = 'filter-btn' + (currentFilter.size === 0 ? ' active' : '');
    allBtn.textContent = 'すべて';
    allBtn.addEventListener('click', function() {
      currentFilter = new Set();
      updateFilterBtns();
      renderFilterSheet();
      if (currentView === 'grid') renderGrid(); else renderTimeline();
    });
    row.appendChild(allBtn);
    // 各ジャンル
    getAllGenres().forEach(function(g) {
      var name = typeof g === 'string' ? g : g.name;
      var btn = document.createElement('button');
      btn.className = 'filter-btn' + (currentFilter.has(name) ? ' active' : '');
      btn.textContent = name;
      btn.addEventListener('click', function() {
        if (currentFilter.has(name)) currentFilter.delete(name);
        else currentFilter.add(name);
        updateFilterBtns();
        renderFilterSheet();
        if (currentView === 'grid') renderGrid(); else renderTimeline();
      });
      row.appendChild(btn);
    });
    // タグ絞り込みも追加
    if (currentTagFilter) {
      var tagBtn = document.createElement('button');
      tagBtn.className = 'filter-btn active';
      tagBtn.textContent = '#' + currentTagFilter + ' ×';
      tagBtn.style.background = 'var(--accent)';
      tagBtn.style.color = '#fff';
      tagBtn.addEventListener('click', function() {
        currentTagFilter = null;
        updateFilterBtns();
        renderFilterSheet();
        if (currentView === 'grid') renderGrid(); else renderTimeline();
      });
      row.appendChild(tagBtn);
    }
    // タグ一覧
    var tagRow = el('fs-tag-row');
    if (tagRow) {
      tagRow.innerHTML = '';
      var tags = getAllTags();
      if (tags.length === 0) {
        tagRow.innerHTML = '<span style="font-size:12px;color:var(--ink3);">タグがありません</span>';
      } else {
        tags.forEach(function(t) {
          var btn = document.createElement('button');
          btn.className = 'filter-btn' + (currentTagFilter === t.tag ? ' active' : '');
          if (currentTagFilter === t.tag) {
            btn.style.background = 'var(--ink)';
            btn.style.color = 'var(--bg)';
            btn.style.borderColor = 'var(--ink)';
          }
          btn.textContent = '#' + t.tag + ' ' + t.count;
          btn.addEventListener('click', function() {
            if (currentTagFilter === t.tag) {
              currentTagFilter = null;
              el('tag-filter-btn').classList.remove('active');
              el('tag-filter-btn').style.background = '';
              el('tag-filter-btn').style.color = '';
              el('tag-filter-btn').style.borderColor = '';
            } else {
              currentTagFilter = t.tag;
              el('tag-filter-btn').classList.add('active');
              el('tag-filter-btn').style.background = 'var(--ink)';
              el('tag-filter-btn').style.color = 'var(--bg)';
              el('tag-filter-btn').style.borderColor = 'var(--ink)';
            }
            updateFilterBtns();
            renderFilterSheet();
            if (currentView === 'grid') renderGrid(); else renderTimeline();
          });
          tagRow.appendChild(btn);
        });
      }
    }
    // 並び替えボタンのアクティブ状態も更新
    ['default','name','lastdate','stars_desc','stars_asc'].forEach(function(s) {
      var b = el('fs-sort-' + s.replace('_','-'));
      if (b) b.classList.toggle('active', currentSort === s);
    });
  }

  // ジャンルグループ切替
  function applyGroupBtn() {
    var icon = groupByGenre ? '⊞' : '⊟';
    ['group-by-genre-btn','group-by-genre-btn-m'].forEach(function(id){
      var b = el(id); if (!b) return;
      b.textContent = icon;
      b.classList.toggle('active', groupByGenre);
    });
  }
  el('group-by-genre-btn').addEventListener('click', function() {
    groupByGenre = !groupByGenre;
    applyGroupBtn();
    if (currentView === 'grid') renderGrid();
  });
  var gbm = el('group-by-genre-btn-m');
  if (gbm) gbm.addEventListener('click', function() {
    groupByGenre = !groupByGenre;
    applyGroupBtn();
    if (currentView === 'grid') renderGrid();
  });
  el('nav-home-btn').addEventListener('click', function(){ setPage('home'); });
  el('nav-tl-btn').addEventListener('click', function(){ setPage('timeline'); });
  el('nav-settings-btn').addEventListener('click', function(){ setPage('settings'); });

  // 設定ページ
  function syncSettingsDriveUI() {
    el('settings-drive-login-btn').style.display  = driveLoggedIn ? 'none'  : 'block';
    el('settings-drive-save-btn').style.display   = driveLoggedIn ? 'block' : 'none';
    el('settings-drive-load-btn').style.display   = driveLoggedIn ? 'block' : 'none';
    el('settings-drive-logout-btn').style.display = driveLoggedIn ? 'block' : 'none';
  }
  el('settings-drive-login-btn').addEventListener('click', function(){ el('drive-login-btn').click(); });
  el('settings-drive-save-btn').addEventListener('click', function(){ el('drive-save-btn').click(); });
  el('settings-drive-load-btn').addEventListener('click', function(){ el('drive-load-btn').click(); });
  el('settings-drive-logout-btn').addEventListener('click', function(){ el('drive-logout-btn').click(); });
  el('settings-bookmory-btn').addEventListener('click', function(){ el('bookmory-import-btn').click(); });
  el('settings-steam-btn').addEventListener('click', function(){ el('steam-import-btn').click(); });
  el('settings-export-btn').addEventListener('click', function(){ el('export-btn').click(); });
  el('settings-import-btn').addEventListener('click', function(){ el('import-btn').click(); });
  el('settings-theme-btn').addEventListener('click', function(){ el('theme-btn').click(); });
  // settings-genres-btn → settings-add-genre-btnに統合
  el('genre-manage-close').addEventListener('click', function(){ el('genre-manage-modal').classList.remove('open'); });
  el('genre-manage-cancel').addEventListener('click', function(){ el('genre-manage-modal').classList.remove('open'); });
  el('settings-add-genre-btn').addEventListener('click', function() {
    var name = el('genre-new-name').value.trim();
    var color = el('genre-new-color').value;
    if (!name) { showToast('ジャンル名を入力してください','error'); return; }
    if (getAllGenres().some(function(g){ return (typeof g==='string'?g:g.name)===name; })) {
      showToast('そのジャンルはすでに存在します','error'); return;
    }
    if (addGenre(name, color)) {
      el('genre-new-name').value='';
      showToast('ジャンル「'+name+'」を追加しました','success');
      openGenreManage();
    }
  });

  function openGenreManage() {
    var list = el('genre-manage-list');
    list.innerHTML = '';
    var DEFAULTS = ['ゲーム','映画','小説','マンガ','アニメ','音楽','心情','その他'];
    getAllGenres().forEach(function(g) {
      var name = typeof g==='string' ? g : g.name;
      var color = typeof g==='string' ? '#888' : (g.color||'#888');
      var isDefault = DEFAULTS.indexOf(name) !== -1;
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface2);border-radius:8px;';
      row.innerHTML = '<span style="width:12px;height:12px;border-radius:50%;background:'+color+';flex-shrink:0;display:inline-block;"></span>'
        + '<span style="flex:1;font-size:14px;">'+escapeHTML(name)+'</span>'
        + (isDefault
          ? '<span style="font-size:11px;color:var(--ink3);">デフォルト</span>'
          : '<button type="button" data-del="'+escapeHTML(name)+'" style="padding:4px 12px;border-radius:6px;border:1.5px solid #c94a2a;background:none;color:#c94a2a;font-size:12px;cursor:pointer;font-family:sans-serif;">削除</button>');
      var delBtn = row.querySelector('button[data-del]');
      if (delBtn) {
        delBtn.addEventListener('click', function() {
          var n = this.getAttribute('data-del');
          if (!confirm('「'+n+'」を削除しますか？このジャンルのカードは「その他」になります。')) return;
          items.forEach(function(item){ if(item.genre===n) item.genre='その他'; });
          customGenres = customGenres.filter(function(cg){ return cg.name!==n; });
          saveGenres(); saveData(); rebuildGenreUI();
          showToast('「'+n+'」を削除しました','success');
          openGenreManage();
        });
      }
      list.appendChild(row);
    });
    el('genre-manage-modal').classList.add('open');
  }

  el('add-type-modal').addEventListener('click', function(e){ if(e.target===this) this.classList.remove('open'); });
  el('add-type-normal').addEventListener('click', function(){ el('add-type-modal').classList.remove('open'); openModal(null); });
  el('add-type-mood').addEventListener('click', function(){ el('add-type-modal').classList.remove('open'); openMoodModal(null); });
  el('add-type-folder').addEventListener('click', function(){ el('add-type-modal').classList.remove('open'); openFolderModal(null); });

  el('folder-back-btn').addEventListener('click', closeFolderInner);

  el('mood-modal-close').addEventListener('click', function(){ el('mood-modal').classList.remove('open'); });
  el('mood-cancel-btn').addEventListener('click', function(){ el('mood-modal').classList.remove('open'); });
  el('mood-save-btn').addEventListener('click', saveMoodItem);
  el('mood-add-date-btn').addEventListener('click', function(){
    var list=el('mood-date-list');
    var row=document.createElement('div'); row.className='date-row';
    var s=document.createElement('input'); s.type='date'; s.className='date-start';
    var sep=document.createElement('span'); sep.className='date-sep'; sep.textContent='〜';
    var e=document.createElement('input'); e.type='date'; e.className='date-end';
    var rm=document.createElement('button'); rm.type='button'; rm.className='date-remove'; rm.textContent='×';
    rm.addEventListener('click',function(){row.remove();});
    row.appendChild(s); row.appendChild(sep); row.appendChild(e); row.appendChild(rm); list.appendChild(row);
  });
  el('mood-delete-btn').addEventListener('click', function(){
    if(!confirm('このムードを削除しますか？')) return;
    items=items.filter(function(x){return String(x.id)!==String(moodEditingId);});
    saveData(); el('mood-modal').classList.remove('open'); renderGrid(); showToast('削除しました');
  });

  el('folder-cover-file').addEventListener('change', function() {
    var file = this.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      compressImage(e.target.result, function(compressed) {
        folderCoverData = compressed;
        el('folder-cover-preview').src = compressed;
        el('folder-cover-preview').style.display = 'block';
        el('folder-cover-placeholder').style.display = 'none';
        el('folder-cover-clear').style.display = 'block';
      });
    };
    reader.readAsDataURL(file);
  });
  el('folder-cover-clear').addEventListener('click', function() {
    folderCoverData = null;
    el('folder-cover-preview').src = '';
    el('folder-cover-preview').style.display = 'none';
    el('folder-cover-placeholder').style.display = 'block';
    el('folder-cover-clear').style.display = 'none';
    el('folder-cover-file').value = '';
  });
  el('folder-modal-close').addEventListener('click', function(){ el('folder-modal').classList.remove('open'); });
  el('folder-cancel-btn').addEventListener('click', function(){ el('folder-modal').classList.remove('open'); });
  el('folder-save-btn').addEventListener('click', saveFolderItem);
  el('folder-delete-btn').addEventListener('click', function(){
    if(!confirm('このフォルダーを削除しますか？')) return;
    items=items.filter(function(x){return String(x.id)!==String(folderEditingId);});
    saveData(); el('folder-modal').classList.remove('open'); renderGrid(); showToast('削除しました');
  });
  document.querySelectorAll('#folder-star-input button').forEach(function(btn){
    btn.addEventListener('click', function(){ setFolderStar(parseInt(btn.getAttribute('data-val'))); });
  });

  // データメニュー位置調整（設定ボタンの上に表示）
  el('data-menu').style.bottom = '76px';
  el('data-menu').style.top = 'auto';
  el('data-menu').style.right = '16px';

  refreshFolderSelect('');

  // ===== ジャンル管理 =====
  el('genre-manage-btn').addEventListener('click', function() {
    el('data-menu').style.display = 'none';
    openGenreManage();
  });
  el('genre-manage-close').addEventListener('click', function() {
    el('genre-manage-modal').classList.remove('open');
  });
  el('genre-manage-cancel').addEventListener('click', function() {
    el('genre-manage-modal').classList.remove('open');
  });

  function openGenreManage() {
    var list = el('genre-manage-list');
    list.innerHTML = '';
    var DEFAULT_GENRES_SET = ['ゲーム','映画','小説','マンガ','アニメ','心情','その他'];
    getAllGenres().forEach(function(g) {
      var name = typeof g === 'string' ? g : g.name;
      var isDefault = DEFAULT_GENRES_SET.indexOf(name) !== -1;
      var color = genreDefaultColor(name);
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);';
      var dot = document.createElement('span');
      dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:'+color+';flex-shrink:0;';
      var nameEl = document.createElement('span');
      nameEl.style.cssText = 'flex:1;font-size:14px;color:var(--ink);';
      nameEl.textContent = name;
      var countEl = document.createElement('span');
      var cnt = items.filter(function(x){ return x.genre === name; }).length;
      countEl.style.cssText = 'font-family:monospace;font-size:11px;color:var(--ink3);';
      countEl.textContent = cnt + '件';
      row.appendChild(dot);
      row.appendChild(nameEl);
      row.appendChild(countEl);
      if (!isDefault) {
        var delBtn = document.createElement('button');
        delBtn.style.cssText = 'padding:4px 12px;border-radius:6px;border:1.5px solid #c94a2a;background:none;color:#c94a2a;font-size:12px;cursor:pointer;';
        delBtn.textContent = '削除';
        delBtn.setAttribute('data-del', name);
        delBtn.addEventListener('click', function() {
          var n = this.getAttribute('data-del');
          if (!confirm('「'+n+'」を削除しますか？このジャンルのカードは「その他」になります。')) return;
          items.forEach(function(item){ if(item.genre===n) item.genre='その他'; });
          customGenres = customGenres.filter(function(cg){ return cg.name!==n; });
          saveGenres(); saveData(); rebuildGenreUI();
          showToast('「'+n+'」を削除しました','success');
          openGenreManage();
        });
        row.appendChild(delBtn);
      } else {
        var lockEl = document.createElement('span');
        lockEl.style.cssText = 'font-size:11px;color:var(--ink3);';
        lockEl.textContent = 'デフォルト';
        row.appendChild(lockEl);
      }
      list.appendChild(row);
    });
    el('genre-manage-modal').classList.add('open');
  }

  // 設定ページ用ジャンル一覧描画
  function renderSettingsGenre() {
    var list = el('settings-genre-list');
    if (!list) return;
    list.innerHTML = '';
    var DEFAULT_GENRES_SET = ['ゲーム','映画','小説','マンガ','アニメ','心情','その他'];
    getAllGenres().forEach(function(g) {
      var name = typeof g === 'string' ? g : g.name;
      var isDefault = DEFAULT_GENRES_SET.indexOf(name) !== -1;
      var color = genreDefaultColor(name);
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);';
      var dot = document.createElement('span');
      dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:'+color+';flex-shrink:0;';
      var nameEl = document.createElement('span');
      nameEl.style.cssText = 'flex:1;font-size:14px;color:var(--ink);';
      nameEl.textContent = name;
      var cnt = items.filter(function(x){ return x.genre===name; }).length;
      var countEl = document.createElement('span');
      countEl.style.cssText = 'font-size:11px;color:var(--ink3);';
      countEl.textContent = cnt + '件';
      row.appendChild(dot); row.appendChild(nameEl); row.appendChild(countEl);
      if (!isDefault) {
        var delBtn = document.createElement('button');
        delBtn.style.cssText = 'padding:4px 12px;border-radius:6px;border:1.5px solid #c94a2a;background:none;color:#c94a2a;font-size:12px;cursor:pointer;';
        delBtn.textContent = '削除';
        delBtn.addEventListener('click', (function(n){ return function() {
          if (!confirm('「'+n+'」を削除しますか？このジャンルのカードは「その他」になります。')) return;
          items.forEach(function(item){ if(item.genre===n) item.genre='その他'; });
          customGenres = customGenres.filter(function(cg){ return cg.name!==n; });
          saveGenres(); saveData(); rebuildGenreUI();
          showToast('「'+n+'」を削除しました','success');
          renderSettingsGenre();
        }; })(name));
        row.appendChild(delBtn);
      } else {
        var lockEl = document.createElement('span');
        lockEl.style.cssText = 'font-size:11px;color:var(--ink3);';
        lockEl.textContent = 'デフォルト';
        row.appendChild(lockEl);
      }
      list.appendChild(row);
    });
  }

  // ===== 設定ページイベント =====
  el('settings-add-genre-btn').addEventListener('click', function() {
    var name = prompt('新しいジャンル名を入力してください');
    if (!name) return;
    name = name.trim();
    if (!name || getAllGenres().some(function(g){ return (typeof g==='string'?g:g.name)===name; })) {
      showToast('そのジャンルはすでに存在します', 'error'); return;
    }
    var colorInput = document.createElement('input');
    colorInput.type='color'; colorInput.value='#888888';
    colorInput.style.cssText='position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(colorInput);
    colorInput.addEventListener('change', function() {
      document.body.removeChild(colorInput);
      if (addGenre(name, colorInput.value)) {
        renderSettingsPage();
        showToast('ジャンル「'+name+'」を追加しました', 'success');
      }
    });
    setTimeout(function(){ colorInput.click(); }, 100);
  });

  el('settings-theme-btn').addEventListener('click', function() {
    syncThemeInputs(); el('theme-modal').classList.add('open');
  });

  el('settings-drive-login-btn').addEventListener('click', function() {
    if (!tokenClient) { initGoogleAuth(); setTimeout(function(){ if(tokenClient) tokenClient.requestAccessToken(); }, 800); return; }
    tokenClient.requestAccessToken();
  });
  el('settings-drive-save-btn').addEventListener('click', function() {
    if (!accessToken) { if(tokenClient) tokenClient.requestAccessToken(); return; }
    driveSetStatus('保存中…');
    driveFindFile(function(){ driveSaveRaw(function(ok){ driveSetStatus(ok?'保存しました':'保存失敗'); el('settings-drive-status').textContent=ok?'保存しました':'保存失敗'; }); });
  });
  el('settings-drive-load-btn').addEventListener('click', function() {
    if (!accessToken) { if(tokenClient) tokenClient.requestAccessToken(); return; }
    driveFileId=null; localStorage.removeItem('drive-file-id');
    driveFindFile(function(){
      if(!driveFileId){el('settings-drive-status').textContent='データが見つかりません';return;}
      driveLoadRaw(function(loaded){
        if(!loaded){el('settings-drive-status').textContent='読み込み失敗';return;}
        if(!confirm('Driveのデータ（'+loaded.length+'件）で上書きしますか？'))return;
        items=loaded; _origSaveData();
        if(currentView==='grid') renderGrid(); else renderTimeline();
        el('settings-drive-status').textContent='読み込み完了: '+loaded.length+'件';
        showToast('読み込み完了', 'success');
      });
    });
  });
  el('settings-drive-logout-btn').addEventListener('click', function() {
    if(accessToken && typeof google!=='undefined') try{google.accounts.oauth2.revoke(accessToken,function(){});}catch(e){}
    accessToken=null; driveFileId=null;
    localStorage.removeItem('drive-file-id'); localStorage.removeItem('drive-logged-in');
    driveSetLoggedIn(false); driveSetStatus('');
    renderSettingsPage();
  });

  el('settings-export-btn').addEventListener('click', function() {
    var json=JSON.stringify(items,null,2);
    var blob=new Blob([json],{type:'application/json;charset=utf-8'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    var d=new Date(); a.download='sakuhin-log-'+d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2)+'.json';
    document.body.appendChild(a); a.click(); setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(a.href);},100);
  });
  el('settings-import-btn').addEventListener('click', function() { el('import-file').click(); });
  el('settings-bookmory-btn').addEventListener('click', function() { el('bookmory-file').click(); });
  el('settings-steam-btn').addEventListener('click', function() { el('steam-modal').classList.add('open'); });

  // ===== フォルダー操作イベント =====

  // バルクバー「フォルダーに追加」
  el('bulk-add-folder-btn').addEventListener('click', function() {
    if (!selectedIds.size) { showToast('作品を選択してください', 'error'); return; }
    var folders = items.filter(function(x){ return x.cardType === 'folder'; });
    if (!folders.length) { showToast('フォルダーがありません', 'error'); return; }
    var list = el('bulk-folder-list');
    list.innerHTML = '';
    folders.forEach(function(f) {
      var btn = document.createElement('button');
      btn.className = 'folder-choice-btn';
      btn.textContent = '📁 ' + f.name + (f.childIds ? '  (' + f.childIds.length + '件)' : '');
      btn.addEventListener('click', function() {
        var fid = String(f.id);
        selectedIds.forEach(function(id) {
          // 他フォルダーから外す
          items.forEach(function(fi){
            if (fi.cardType==='folder' && String(fi.id)!==fid)
              fi.childIds = (fi.childIds||[]).filter(function(c){ return c!==id; });
          });
          // このフォルダーに追加
          if (!f.childIds) f.childIds = [];
          if (f.childIds.indexOf(id) === -1) f.childIds.push(id);
        });
        saveData();
        el('bulk-folder-modal').classList.remove('open');
        showToast(selectedIds.size + '件を「' + f.name + '」に追加しました', 'success');
        exitSelectMode();
        renderGrid();
      });
      list.appendChild(btn);
    });
    el('bulk-folder-modal').classList.add('open');
  });

  // バルクバー「フォルダーから外す」（フォルダー内表示中のみ表示）
  el('bulk-remove-folder-btn').addEventListener('click', function() {
    if (!selectedIds.size) { showToast('作品を選択してください', 'error'); return; }
    var folder = items.find(function(x){ return String(x.id) === String(currentFolderId); });
    if (!folder) return;
    selectedIds.forEach(function(id) {
      folder.childIds = (folder.childIds||[]).filter(function(c){ return c !== id; });
    });
    saveData();
    showToast(selectedIds.size + '件をフォルダーから外しました', 'success');
    exitSelectMode();
    renderGrid();
  });

  // フォルダー選択モーダル「キャンセル」
  el('bulk-folder-new-btn').addEventListener('click', function() {
    el('bulk-folder-modal').classList.remove('open');
    // フォルダー作成後に選択されたアイテムをそのフォルダーに追加するコールバックを設定
    var pendingIds = Array.from(selectedIds);
    openFolderModal(null);
    // saveFolderItemをフック: 保存後に自動でアイテムを追加
    var origSave = saveFolderItem;
    saveFolderItem = function() {
      origSave();
      saveFolderItem = origSave; // フックを元に戻す
      // 最後に追加されたフォルダーを探してアイテムを追加
      var newFolder = items[0]; // unshiftしているので先頭
      if (newFolder && newFolder.cardType === 'folder') {
        pendingIds.forEach(function(id) {
          items.forEach(function(f){
            if (f.cardType==='folder' && String(f.id)!==String(newFolder.id))
              f.childIds = (f.childIds||[]).filter(function(c){ return c!==id; });
          });
          if (!newFolder.childIds) newFolder.childIds = [];
          if (newFolder.childIds.indexOf(id) === -1) newFolder.childIds.push(id);
        });
        saveData();
        showToast(pendingIds.length + '件を「' + newFolder.name + '」に追加しました', 'success');
        exitSelectMode();
        renderGrid();
      }
    };
  });
  el('bulk-folder-cancel-btn').addEventListener('click', function() {
    el('bulk-folder-modal').classList.remove('open');
  });
  el('bulk-folder-modal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });

  // 戻るボタンへのドラッグ&ドロップ
  el('folder-back-btn').addEventListener('dragover', function(e) {
    if (!currentFolderId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el('folder-back-btn').classList.add('drag-over');
  });
  el('folder-back-btn').addEventListener('dragleave', function() {
    el('folder-back-btn').classList.remove('drag-over');
  });
  el('folder-back-btn').addEventListener('drop', function(e) {
    e.preventDefault();
    el('folder-back-btn').classList.remove('drag-over');
    if (!dragItemId || !currentFolderId) return;
    var folder = items.find(function(x){ return String(x.id) === String(currentFolderId); });
    if (folder) {
      folder.childIds = (folder.childIds||[]).filter(function(c){ return c !== dragItemId; });
      saveData();
      var di = items.find(function(x){ return String(x.id) === dragItemId; });
      showToast((di ? di.name : '') + ' をフォルダーから外しました', 'success');
      renderGrid();
    }
    dragItemId = null;
  });

  // ===== ドラッグ&ドロップ =====
  var dragItemId = null;

  el('grid-view').addEventListener('dragstart', function(e) {
    var card = e.target.closest('.card');
    if (!card) return;
    // フォルダーカード自体はドラッグ不可
    var item = items.find(function(x){ return String(x.id) === card.getAttribute('data-id'); });
    if (item && item.cardType === 'folder') { e.preventDefault(); return; }
    dragItemId = card.getAttribute('data-id');
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  el('grid-view').addEventListener('dragend', function(e) {
    var card = e.target.closest('.card');
    if (card) card.classList.remove('dragging');
    document.querySelectorAll('.card.drag-over').forEach(function(c){ c.classList.remove('drag-over'); });
    dragItemId = null;
  });

  el('grid-view').addEventListener('dragover', function(e) {
    var card = e.target.closest('.card');
    if (!card) return;
    var item = items.find(function(x){ return String(x.id) === card.getAttribute('data-id'); });
    if (item && item.cardType === 'folder') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.card.drag-over').forEach(function(c){ c.classList.remove('drag-over'); });
      card.classList.add('drag-over');
    }
  });

  el('grid-view').addEventListener('dragleave', function(e) {
    var card = e.target.closest('.card');
    if (card) card.classList.remove('drag-over');
  });

  el('grid-view').addEventListener('drop', function(e) {
    e.preventDefault();
    var card = e.target.closest('.card');
    if (!card) return;
    card.classList.remove('drag-over');
    var folderId = card.getAttribute('data-id');
    var folder = items.find(function(x){ return String(x.id) === folderId && x.cardType === 'folder'; });
    if (!folder || !dragItemId || dragItemId === folderId) return;
    if (!folder.childIds) folder.childIds = [];
    // 他のフォルダーから外す
    items.forEach(function(f){
      if (f.cardType === 'folder' && String(f.id) !== folderId) {
        f.childIds = (f.childIds||[]).filter(function(c){ return c !== dragItemId; });
      }
    });
    // このフォルダーに追加（重複防止）
    if (folder.childIds.indexOf(dragItemId) === -1) {
      folder.childIds.push(dragItemId);
      saveData();
      var itemName = '';
      var draggedItem = items.find(function(x){ return String(x.id) === dragItemId; });
      if (draggedItem) itemName = draggedItem.name;
      showToast('「' + itemName + '」を追加しました', 'success');
      renderGrid();
    }
    dragItemId = null;
  });

  // ジャンルUI初期構築
  rebuildGenreUI();

  // ボタン状態初期化
  applyLayoutBtns();
  applyViewBtns('grid');
  applySelectBtn(false);

  // 初期レンダリング
  setPage('home');

})();

// ==================== タイトル表示切替（独立スクリプト） ====================
(function () {
  var KEY = 'sakuhin-show-titles';
  var body = document.body;
  var btn = document.getElementById('toggle-title-btn');
  var show = localStorage.getItem(KEY) === '1';
  function apply() {
    body.classList.toggle('show-card-titles', show);
    if (btn) btn.classList.toggle('active', show);
  }
  apply();
  if (btn) {
    btn.addEventListener('click', function () {
      show = !show;
      localStorage.setItem(KEY, show ? '1' : '0');
      apply();
    });
  }
})();

// ==================== カードデザイン切替（独立スクリプト） ====================
(function () {
  var KEY = 'sakuhin-card-style';
  var body = document.body;
  var btnDefault = document.getElementById('card-style-default-btn');
  var btnFloat = document.getElementById('card-style-float-btn');
  var style = localStorage.getItem(KEY) || 'default';
  function apply() {
    body.classList.toggle('card-style-float', style === 'float');
    if (btnDefault) btnDefault.classList.toggle('active', style === 'default');
    if (btnFloat) btnFloat.classList.toggle('active', style === 'float');
  }
  apply();
  if (btnDefault) btnDefault.addEventListener('click', function () {
    style = 'default'; localStorage.setItem(KEY, style); apply();
  });
  if (btnFloat) btnFloat.addEventListener('click', function () {
    style = 'float'; localStorage.setItem(KEY, style); apply();
  });
})();

// ==================== サイドバー折りたたみ（独立スクリプト） ====================
(function () {
  var KEY = 'sakuhin-sidebar-collapsed';
  var body = document.body;
  var btn = document.getElementById('sidebar-collapse-btn');
  var collapsed = localStorage.getItem(KEY) === '1';
  function apply() {
    body.classList.toggle('sidebar-collapsed', collapsed);
    if (btn) btn.title = collapsed ? 'メニューを広げる' : 'メニューを折りたたむ';
  }
  apply();
  if (btn) {
    btn.addEventListener('click', function () {
      collapsed = !collapsed;
      localStorage.setItem(KEY, collapsed ? '1' : '0');
      apply();
    });
  }
})();
