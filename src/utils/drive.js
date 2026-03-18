const CLIENT_ID = '586982625413-hto13tgg5sasgh4cdmvh8jibb7kbs2va.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const FILE_NAME = 'sakuhin-log-data.json';

let _tokenClient = null;
let _accessToken = null;
let _tokenExpiry = 0;
let _fileId = localStorage.getItem('drive-file-id') || null;

function isTokenValid() {
  return _accessToken && Date.now() < _tokenExpiry - 60000;
}

export function initGoogleAuth(onStatusChange) {
  if (!window.google) return;
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (resp.error) { onStatusChange('error', resp.error); return; }
      _accessToken = resp.access_token;
      _tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
      localStorage.setItem('drive-logged-in', '1');
      onStatusChange('loggedIn');
    },
  });
  if (localStorage.getItem('drive-logged-in') === '1') {
    onStatusChange('loggedIn');
  }
}

export function driveLogin(onStatusChange) {
  if (!_tokenClient) { onStatusChange('error', 'Google認証が初期化されていません'); return; }
  _tokenClient.requestAccessToken({ prompt: '' });
}

export function driveLogout(onStatusChange) {
  if (_accessToken) window.google?.accounts.oauth2.revoke(_accessToken, () => {});
  _accessToken = null;
  _tokenExpiry = 0;
  _fileId = null;
  localStorage.removeItem('drive-logged-in');
  localStorage.removeItem('drive-file-id');
  onStatusChange('loggedOut');
}

async function withToken(fn, onStatusChange) {
  if (isTokenValid()) return fn(_accessToken);
  return new Promise((resolve) => {
    if (!_tokenClient) { onStatusChange('error', '未ログイン'); resolve(null); return; }
    const origCallback = _tokenClient.callback;
    _tokenClient.callback = (resp) => {
      _tokenClient.callback = origCallback;
      if (resp.error) { onStatusChange('error', resp.error); resolve(null); return; }
      _accessToken = resp.access_token;
      _tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
      resolve(fn(_accessToken));
    };
    _tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function findFile(token) {
  if (_fileId) return _fileId;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name%3D'${FILE_NAME}'+and+trashed%3Dfalse&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (data.files && data.files.length) {
    _fileId = data.files[0].id;
    localStorage.setItem('drive-file-id', _fileId);
    return _fileId;
  }
  return null;
}

export async function driveSave(items, onStatusChange) {
  const json = JSON.stringify(items, null, 2);
  return withToken(async (token) => {
    try {
      const fid = await findFile(token);
      let res;
      if (fid) {
        res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fid}?uploadType=media`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: json,
        });
      } else {
        const meta = new Blob([JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' })], { type: 'application/json' });
        const body = new Blob([json], { type: 'application/json' });
        const form = new FormData();
        form.append('metadata', meta);
        form.append('file', body);
        res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
        });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _fileId = data.id;
      localStorage.setItem('drive-file-id', _fileId);
      onStatusChange('saved');
      return true;
    } catch (e) {
      onStatusChange('error', e.message);
      return false;
    }
  }, onStatusChange);
}

export async function driveLoad(onStatusChange) {
  return withToken(async (token) => {
    try {
      _fileId = null;
      localStorage.removeItem('drive-file-id');
      const fid = await findFile(token);
      if (!fid) { onStatusChange('notFound'); return null; }
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fid}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onStatusChange('loaded');
      return data;
    } catch (e) {
      onStatusChange('error', e.message);
      return null;
    }
  }, onStatusChange);
}

export function isDriveLoggedIn() {
  return localStorage.getItem('drive-logged-in') === '1';
}
