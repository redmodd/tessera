/**
 * Time / number formatters for SCORM & cmi5 data-model writes.
 */

/**
 * Format integer seconds as SCORM 1.2 `CMITimespan` (HHHH:MM:SS.SS).
 *
 * `DurationTracker.sessionSeconds` always feeds integer seconds via
 * `Math.floor`, so the centisecond field is always `.00`. The format
 * still includes it because `CMITimespan` is defined that way and some
 * older LMS importers reject the bare HHHH:MM:SS form.
 */
export function formatHHMMSS(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const hh = String(hours).padStart(4, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}.00`;
}

/**
 * SCORM 2004 4E §4.2/§4.3 define CMIDecimal-like elements as real(10,7) —
 * `String(1/3)` exceeds that and trips SCORM Cloud with error 406. Rounds,
 * then trims trailing zeros (no padded "0.8500000" forms).
 */
export function formatReal107(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1e7) / 1e7;
  return rounded
    .toFixed(7)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}

/**
 * SCORM 2004 4E §3.3.10.1 references ISO 8601 §5.3.3 — local date+time, no
 * zone designator. Strict validators reject `Z`, `±hh:mm`, and fractional
 * seconds with error 406. UTC components are used so writes don't drift
 * across local-TZ flips even though the format is zone-free.
 */
export function formatISO8601Timestamp(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

/**
 * Format seconds as ISO 8601 duration: PT1H30M45S
 */
export function formatISO8601Duration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let result = 'PT';
  if (hours > 0) result += `${hours}H`;
  if (minutes > 0) result += `${minutes}M`;
  if (seconds > 0 || result === 'PT') result += `${seconds}S`;
  return result;
}

export function parseScaled01(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}
