/**
 * Date & Time utilities tailored for Indian Standard Time (IST - Asia/Kolkata).
 * Ensures naive UTC timestamps from the backend and local browser actions
 * are consistently parsed and rendered in IST.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Safely parses any date string, timestamp number, or Date object into a valid Date.
 * If a date string lacks timezone metadata (no 'Z' and no offset), it treats it as UTC,
 * ensuring accurate conversion into Indian Standard Time (+05:30).
 */
export function parseToDate(val: string | number | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') return new Date(val);

  let str = String(val).trim();
  if (!str) return null;

  // If string does not specify a timezone (no 'Z' and no +HH:MM / -HH:MM offset),
  // treat it as UTC so it translates accurately into IST.
  if (!str.endsWith('Z') && !str.includes('+') && !str.match(/-\d{2}:\d{2}$/)) {
    if (str.includes(' ') && !str.includes('T')) {
      str = str.replace(' ', 'T');
    }
    str += 'Z';
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a timestamp into an IST time string, e.g. "12:05:30 pm" or "12:05 pm".
 */
export function formatISTTime(
  val: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseToDate(val);
  if (!d) return '--';
  return d.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    ...options,
  });
}

/**
 * Formats a timestamp into an IST date string, e.g. "05 Sep 2026".
 */
export function formatISTDate(
  val: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseToDate(val);
  if (!d) return '--';
  return d.toLocaleDateString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

/**
 * Formats a timestamp into an IST combined date and time string, e.g. "05 Sep 2026, 12:05 pm IST".
 */
export function formatISTDateTime(
  val: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseToDate(val);
  if (!d) return '--';
  return d.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  });
}
