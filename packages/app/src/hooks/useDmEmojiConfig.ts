const STORAGE_KEY = 'bsky_dm_emoji';
const EMOJI_URL = '/emoji.txt';

const SKIN_TONES = ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];

function hasSkinTone(s: string): boolean {
  return SKIN_TONES.some(st => s.includes(st));
}

function stripSkinTone(s: string): string {
  let r = s;
  for (const st of SKIN_TONES) r = r.replaceAll(st, '');
  return r;
}

export interface EmojiItem {
  key: string;
  emoji: string;
  hasVariants: boolean;
  variants: string[];
}

const DEFAULT_EMOJIS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F621}', '\u{1F525}', '\u{1F389}'];

export function getDmEmojiConfig(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [...DEFAULT_EMOJIS];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_EMOJIS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return [...DEFAULT_EMOJIS];
  } catch {
    return [...DEFAULT_EMOJIS];
  }
}

export function saveDmEmojiConfig(emojis: string[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emojis));
}

export async function fetchAllEmojis(): Promise<EmojiItem[]> {
  const res = await fetch(EMOJI_URL);
  const text = await res.text();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const groupMap = new Map<string, string[]>();
  for (const emoji of lines) {
    const arr = groupMap.get(emoji) || [];
    if (hasSkinTone(emoji)) {
      const base = stripSkinTone(emoji);
      const baseArr = groupMap.get(base) || [];
      baseArr.push(emoji);
      groupMap.set(base, baseArr);
    } else {
      arr.push(emoji);
      groupMap.set(emoji, arr);
    }
  }

  const result: EmojiItem[] = [];
  for (const [key, variants] of groupMap) {
    const skinless = variants.filter(v => !hasSkinTone(v));
    const display = skinless.length > 0 ? skinless[0]! : variants[0]!;
    result.push({
      key,
      emoji: display,
      hasVariants: variants.length > 1 || (variants.length === 1 && hasSkinTone(variants[0]!)),
      variants,
    });
  }
  return result;
}
