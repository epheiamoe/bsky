/**
 * i18n-aware relative time formatter for notification timestamps.
 *
 * Boundary coverage:
 * - invalid / future dates fall back to "just now"
 * - deltas are bucketed into minutes/hours/days/months/years
 */
export function formatTimeAgo(dateStr: string, t: (key: string) => string): string {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);

  if (Number.isNaN(seconds) || seconds < 0) return t('timeAgo.justNow');
  if (seconds < 60) return t('timeAgo.justNow');

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('timeAgo.minutes').replace('{n}', String(minutes));

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeAgo.hours').replace('{n}', String(hours));

  const days = Math.floor(hours / 24);
  if (days < 30) return t('timeAgo.days').replace('{n}', String(days));

  const months = Math.floor(days / 30);
  if (months < 12) return t('timeAgo.months').replace('{n}', String(months));

  return t('timeAgo.years').replace('{n}', String(Math.floor(months / 12)));
}
