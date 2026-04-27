export function v4(): string {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { id += '-'; continue; }
    if (i === 14) { id += '4'; continue; }
    if (i === 19) { id += hex[Math.floor(Math.random() * 4) + 8]!; continue; }
    id += hex[Math.floor(Math.random() * 16)]!;
  }
  return id;
}
