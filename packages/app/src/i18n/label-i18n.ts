/**
 * [v0.15.0] Label name i18n lookup map.
 *
 * Maps label identifiers to i18n keys for translation.
 * Community labels can be registered here.
 */

export const LABEL_I18N_KEYS: Record<string, string> = {
  // Official Bluesky labels
  'porn': 'moderation.labels.porn',
  'sexual': 'moderation.labels.sexual',
  'nudity': 'moderation.labels.nudity',
  'graphic-media': 'moderation.labels.graphic-media',

  // Community labels (examples, can be extended)
  // 'transphobia': 'moderation.labels.transphobia',
  // 'spam': 'moderation.labels.spam',
};

/**
 * Get translated label name with fallback.
 *
 * @param val — Label identifier (e.g., 'porn', 'sexual')
 * @param t — i18n translate function
 * @param fallback — Fallback name if no translation found
 * @returns Translated label name or fallback
 */
export function getLabelName(
  val: string,
  t: (key: string) => string,
  fallback?: string
): string {
  const key = LABEL_I18N_KEYS[val];
  if (key) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return fallback || val;
}
