/**
 * Timezone helpers shared by attendance and daily reports. Branch schedules
 * are stored as wall-clock "HH:mm" strings in `attendanceConfig.timezone`,
 * so every comparison has to happen in that zone, never in server time.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const timeToMinutes = (time: string): number => {
  const parts = time.split(":").map(Number);
  const hours = parts[0];
  const minutes = parts[1];

  if (
    hours === undefined ||
    minutes === undefined ||
    isNaN(hours) ||
    isNaN(minutes)
  ) {
    throw new Error(`Invalid time format: "${time}". Expected "HH:mm".`);
  }

  return hours * 60 + minutes;
};

/** "HH:mm" wall-clock time of `date` in `timezone`. */
export const getTimeInTimezone = (date: Date, timezone: string): string => {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

/** "YYYY-MM-DD" calendar date of `date` in `timezone`. */
export const getDateInTimezone = (timezone: string, date = new Date()): string => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

/** 0 (Sun) – 6 (Sat) for `date` in `timezone`. */
export const getDayOfWeekInTimezone = (
  timezone: string,
  date = new Date(),
): number => {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);

  const dayNumber = WEEKDAY_INDEX[weekday];
  if (dayNumber === undefined) {
    throw new Error(`Invalid day of week calculated: "${weekday}"`);
  }

  return dayNumber;
};

/** Day of week for a "YYYY-MM-DD" calendar date (timezone-independent). */
export const getDayOfWeekForDate = (dateStr: string): number =>
  new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();

/** Milliseconds `timezone` is ahead of UTC at the instant `date`. */
const getTimezoneOffsetMs = (date: Date, timezone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/**
 * The absolute instant of wall-clock `time` ("HH:mm") on `dateStr`
 * ("YYYY-MM-DD") in `timezone`. Re-checks the offset once so a DST switch
 * between the guess and the real instant doesn't shift the result.
 */
export const zonedTimeToUtc = (
  dateStr: string,
  time: string,
  timezone: string,
): Date => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const minutes = timeToMinutes(time);

  const wallClockAsUtc = Date.UTC(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    Math.floor(minutes / 60),
    minutes % 60,
  );

  let instant = wallClockAsUtc - getTimezoneOffsetMs(new Date(wallClockAsUtc), timezone);
  instant = wallClockAsUtc - getTimezoneOffsetMs(new Date(instant), timezone);

  return new Date(instant);
};

/** [start, end) instants of calendar day `dateStr` in `timezone`. */
export const getDayBoundsInTimezone = (dateStr: string, timezone: string) => {
  const start = zonedTimeToUtc(dateStr, "00:00", timezone);
  const next = new Date(`${dateStr}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = zonedTimeToUtc(next.toISOString().slice(0, 10), "00:00", timezone);
  return { start, end };
};
