// 距離・日付などの小さな道具

export function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function levelFromXp(xp) {
  return 1 + Math.floor(Math.sqrt((xp || 0) / 250));
}

export function formatDistance(m) {
  if (!m) return '0m';
  return m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.round(m)}m`;
}

export function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// localStorage は使えない環境もあるので try/catch で包む
export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 無視 */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* 無視 */ } },
};

export const JUDGE_LABEL = { nice: 'ナイス', great: 'グレート', excellent: 'エクセレント' };
