// Network First戦略: 常に最新を優先、オフライン時はキャッシュで代替
const CACHE_NAME = 'sakuhin-log-v3';
const CACHE_URLS = ['/sakuhin-log/index.html', '/sakuhin-log/'];

// インストール: キャッシュに保存して即座にアクティブ化
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// アクティブ化: 古いキャッシュを削除
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// フェッチ: Network First
// ネットワークから取得 → 成功したらキャッシュを更新して返す
// 失敗したら（オフライン）キャッシュから返す
self.addEventListener('fetch', function(e) {
  // GETリクエスト以外はスルー
  if (e.request.method !== 'GET') return;
  // Google APIなど外部リクエストはスルー
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      // ネット成功 → キャッシュを更新して返す
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(e.request, clone);
      });
      return response;
    }).catch(function() {
      // オフライン → キャッシュから返す
      return caches.match(e.request).then(function(cached) {
        return cached || caches.match('/sakuhin-log/index.html');
      });
    })
  );
});
