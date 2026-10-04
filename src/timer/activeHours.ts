import type { ActiveHours, Settings } from '@/constants/timer';

/** Minutes since local midnight for a given Date. */
function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** True if `date` falls on an enabled weekday and inside the active-hours window (start inclusive, end exclusive). Overnight windows (start > end) aren't supported — start is assumed to be earlier in the day than end. */
export function isWithinActiveHours(settings: Settings, date: Date): boolean {
  if (!settings.activeWeekdays[date.getDay()]) return false;
  const minutes = minutesOfDay(date);
  return minutes >= settings.activeHours.startMinutes && minutes < settings.activeHours.endMinutes;
}

/**
 * Walks forward day by day (up to 8 days, i.e. a full week plus one) to find
 * the next moment `isWithinActiveHours` would be true, starting from `now`.
 * Returns null only if every weekday is disabled (no active window exists at
 * all).
 */
export function nextActiveWindowStart(settings: Settings, now: Date): Date | null {
  if (!settings.activeWeekdays.some(Boolean)) return null;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidateDay = new Date(now);
    candidateDay.setDate(candidateDay.getDate() + dayOffset);
    candidateDay.setHours(0, 0, 0, 0);
    candidateDay.setMinutes(settings.activeHours.startMinutes);

    if (dayOffset === 0 && candidateDay.getTime() <= now.getTime()) {
      // Today's window already started (or already ended) — only today's
      // start is checked here; if we're currently inside it,
      // isWithinActiveHours() should already be true and the caller
      // wouldn't be asking for the next start. Move on to future days.
      continue;
    }
    if (settings.activeWeekdays[candidateDay.getDay()] && candidateDay.getTime() > now.getTime()) {
      return candidateDay;
    }
  }
  return null;
}

export function formatMinutesOfDay(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

export const WEEKDAY_SHORT_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function describeActiveHours(activeHours: ActiveHours): string {
  return `${formatMinutesOfDay(activeHours.startMinutes)} – ${formatMinutesOfDay(activeHours.endMinutes)}`;
}
