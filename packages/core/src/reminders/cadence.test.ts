import { describe, expect, it } from "vitest";
import {
  DEFAULT_CADENCE,
  isReminderDue,
  nextReminderAt,
  type CadenceState,
} from "./cadence";

// 2026-12-01 15:00 UTC is 10:00 in New York (inside the send window).
const requestedAt = new Date("2026-12-01T15:00:00Z");

const fresh: CadenceState = {
  requestedAt,
  remindersSent: 0,
  lastReminderAt: null,
  complete: false,
  paused: false,
};

describe("nextReminderAt", () => {
  it("schedules the first reminder after firstAfterDays", () => {
    expect(nextReminderAt(fresh)?.toISOString()).toBe("2026-12-04T15:00:00.000Z");
  });

  it("spaces later reminders by everyDays", () => {
    const state = {
      ...fresh,
      remindersSent: 1,
      lastReminderAt: new Date("2026-12-04T15:00:00Z"),
    };
    expect(nextReminderAt(state)?.toISOString()).toBe("2026-12-08T15:00:00.000Z");
  });

  it("stops when the checklist is complete", () => {
    expect(nextReminderAt({ ...fresh, complete: true })).toBeNull();
  });

  it("stops when paused", () => {
    expect(nextReminderAt({ ...fresh, paused: true })).toBeNull();
  });

  it("stops at the reminder cap", () => {
    const state = { ...fresh, remindersSent: DEFAULT_CADENCE.maxReminders };
    expect(nextReminderAt(state)).toBeNull();
  });

  it("pushes a night-time slot to the start of the next send window", () => {
    // Requested at 03:30 UTC = 22:30 New York, outside the window.
    const state = { ...fresh, requestedAt: new Date("2026-12-02T03:30:00Z") };
    // Three days later is still 22:30 local; the next 09:00 local is 14:00 UTC.
    expect(nextReminderAt(state)?.toISOString()).toBe("2026-12-05T14:00:00.000Z");
  });
});

describe("isReminderDue", () => {
  it("is false before the due time", () => {
    expect(isReminderDue(fresh, new Date("2026-12-03T15:00:00Z"))).toBe(false);
  });

  it("is true once due and inside the window", () => {
    expect(isReminderDue(fresh, new Date("2026-12-04T16:00:00Z"))).toBe(true);
  });

  it("is false when overdue but outside the window", () => {
    // 02:00 UTC = 21:00 New York.
    expect(isReminderDue(fresh, new Date("2026-12-05T02:00:00Z"))).toBe(false);
  });
});
