export function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

export function uriToRkey(uri: string): string {
  return uri.split('/').pop() ?? '';
}

export function getPostUrl(handle: string, rkey: string): string {
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}
