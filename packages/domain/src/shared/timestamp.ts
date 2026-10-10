import { DomainValidationError } from './validation-error.js';

const RFC_3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

/** Validates an RFC 3339 date-time and returns its canonical UTC representation. */
export function parseRfc3339Timestamp(value: string, field: string): string {
  const match = RFC_3339_DATE_TIME.exec(value);
  if (match === null) {
    throw new DomainValidationError(`${field} must be an RFC 3339 timestamp.`, field);
  }

  const yearText = match[1]!;
  const monthText = match[2]!;
  const dayText = match[3]!;
  const hourText = match[4]!;
  const minuteText = match[5]!;
  const secondText = match[6]!;
  const offset = match[8]!;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute ||
    calendar.getUTCSeconds() !== second
  ) {
    throw new DomainValidationError(`${field} must contain a valid calendar date and time.`, field);
  }

  if (offset !== 'Z') {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) {
      throw new DomainValidationError(`${field} must contain a valid numeric offset.`, field);
    }
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new DomainValidationError(`${field} must be an RFC 3339 timestamp.`, field);
  }

  return new Date(timestamp).toISOString();
}
