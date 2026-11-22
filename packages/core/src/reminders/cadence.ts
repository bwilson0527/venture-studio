/**
 * Reminder cadence shared by every product: decide when the next nudge to an
 * outside party (tax client, vendor, carrier) is due, and when to stop.
 */

export type CadenceConfig = {
  /** Days to wait after the initial request before the first reminder. */
  firstAfterDays: number;
  /** Days between later reminders. */
  everyDays: number;
  /** Stop after this many reminders so nobody is nagged forever. */
  maxReminders: number;
  /** Local hour window (0-23, end exclusive) in which sends are allowed. */
  sendWindow: { startHour: number; endHour: number };
  /** IANA time zone the window is evaluated in. */
  timeZone: string;
};

export type CadenceState = {
  /** When the original request went out. */
  requestedAt: Date;
  /** Reminders sent so far, not counting the original request. */
  remindersSent: number;
  lastReminderAt: Date | null;
  /** True once nothing is outstanding. */
  complete: boolean;
  /** True if the recipient opted out or the sender paused them. */
  paused: boolean;
};

export const DEFAULT_CADENCE: CadenceConfig = {
  firstAfterDays: 3,
  everyDays: 4,
  maxReminders: 8,
  sendWindow: { startHour: 9, endHour: 18 },
  timeZone: "America/New_York",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function localHour(at: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(at);
  return Number(hour);
}

/** Move a moment forward, hour by hour, until it falls inside the window. */
function intoWindow(at: Date, config: CadenceConfig): Date {
  const { startHour, endHour } = config.sendWindow;
  let candidate = at;
  for (let i = 0; i < 48; i++) {
    const hour = localHour(candidate, config.timeZone);
    if (hour >= startHour && hour < endHour) return candidate;
    const next = new Date(candidate.getTime() + 60 * 60 * 1000);
    next.setUTCMinutes(0, 0, 0);
    candidate = next;
  }
  return candidate;
}

/**
 * The moment the next reminder is due, or null when none should be sent
 * (complete, paused, or the cap is reached).
 */
export function nextReminderAt(
  state: CadenceState,
  config: CadenceConfig = DEFAULT_CADENCE,
): Date | null {
  if (state.complete || state.paused) return null;
  if (state.remindersSent >= config.maxReminders) return null;

  const base = state.lastReminderAt ?? state.requestedAt;
  const gapDays =
    state.lastReminderAt === null ? config.firstAfterDays : config.everyDays;
  return intoWindow(new Date(base.getTime() + gapDays * DAY_MS), config);
}

/** True when a reminder should go out at `now`. */
export function isReminderDue(
  state: CadenceState,
  now: Date,
  config: CadenceConfig = DEFAULT_CADENCE,
): boolean {
  const due = nextReminderAt(state, config);
  if (due === null || due.getTime() > now.getTime()) return false;
  const hour = localHour(now, config.timeZone);
  return hour >= config.sendWindow.startHour && hour < config.sendWindow.endHour;
}
