// YouTube のアドレスから 11 文字の動画 ID を取り出す。
// なぜ：ID 以外（ほかのサイト・変な文字）を記録やプレーヤーに渡さないため、ここで厳しく確かめる。
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];
const PATH_KINDS = ['shorts', 'embed', 'live'];

// 文字列を URL にする。スキームが無ければ https:// を足してもう一度ためす
function toUrl(text) {
  for (const candidate of [text, `https://${text}`]) {
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url;
    } catch {
      // 次の形をためす
    }
  }
  return null;
}

export function parseYoutubeId(input) {
  if (typeof input !== 'string') return null;
  const url = toUrl(input.trim());
  if (!url) return null;
  const host = url.hostname.toLowerCase(); // 完全一致だけ（endsWith / includes は使わない）
  const parts = url.pathname.split('/').filter(Boolean);
  let id = null;
  if (host === 'youtu.be') {
    id = parts.length === 1 ? parts[0] : null;
  } else if (HOSTS.includes(host)) {
    if (parts.length === 1 && parts[0] === 'watch') id = url.searchParams.get('v');
    else if (parts.length === 2 && PATH_KINDS.includes(parts[0])) id = parts[1];
  }
  return id && ID_PATTERN.test(id) ? id : null;
}
