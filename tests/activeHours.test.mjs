import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinActiveHours, nextActiveWindowStart, formatMinutesOfDay } from '../src/timer/activeHours.ts';
import { DEFAULT_SETTINGS } from '../src/constants/timer.ts';

const settings = {
  ...DEFAULT_SETTINGS,
  activeHours: { startMinutes: 9 * 60, endMinutes: 17 * 60 },
  activeWeekdays: [false, true, true, true, true, true, false],
};
// Local date constructors match the app's local-time scheduling contract.
const monday = (hour, minute = 0) => new Date(2026, 9, 5, hour, minute);

test('active window includes its start and excludes its end', () => {
  assert.equal(isWithinActiveHours(settings, monday(8, 59)), false);
  assert.equal(isWithinActiveHours(settings, monday(9)), true);
  assert.equal(isWithinActiveHours(settings, monday(16, 59)), true);
  assert.equal(isWithinActiveHours(settings, monday(17)), false);
});

test('disabled weekdays never activate reminders', () => {
  assert.equal(isWithinActiveHours(settings, new Date(2026, 9, 4, 12)), false);
});

test('next window starts today when the start is still ahead', () => {
  const now = monday(8);
  assert.equal(nextActiveWindowStart(settings, now).getTime(), monday(9).getTime());
  assert.equal(now.getTime(), monday(8).getTime(), 'input date must not change');
});

test('an elapsed window skips the weekend', () => {
  const friday = new Date(2026, 9, 9, 18);
  const nextMonday = new Date(2026, 9, 12, 9);
  assert.equal(nextActiveWindowStart(settings, friday).getTime(), nextMonday.getTime());
});

test('a single enabled day can wrap to the following week', () => {
  const onlyMonday = { ...settings, activeWeekdays: [false, true, false, false, false, false, false] };
  assert.equal(nextActiveWindowStart(onlyMonday, monday(9)).getTime(), new Date(2026, 9, 12, 9).getTime());
});

test('no enabled days returns no upcoming window', () => {
  const disabled = { ...settings, activeWeekdays: Array(7).fill(false) };
  assert.equal(nextActiveWindowStart(disabled, monday(8)), null);
});

test('local start time survives the daylight-saving weekend', () => {
  const friday = new Date(2026, 9, 30, 18);
  assert.equal(nextActiveWindowStart(settings, friday).getTime(), new Date(2026, 10, 2, 9).getTime());
});

test('clock labels handle midnight, noon, and afternoon', () => {
  assert.equal(formatMinutesOfDay(0), '12:00 AM');
  assert.equal(formatMinutesOfDay(12 * 60), '12:00 PM');
  assert.equal(formatMinutesOfDay(17 * 60 + 5), '5:05 PM');
});
