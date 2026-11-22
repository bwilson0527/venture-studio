import { describe, expect, it } from "vitest";
import { checklistProgress } from "./status";

describe("checklistProgress", () => {
  it("is not started with nothing done", () => {
    expect(
      checklistProgress([
        { required: true, state: "needed" },
        { required: false, state: "needed" },
      ]),
    ).toEqual({ status: "not_started", done: 0, total: 1, percent: 0 });
  });

  it("is in progress when some required items remain", () => {
    expect(
      checklistProgress([
        { required: true, state: "uploaded" },
        { required: true, state: "needed" },
      ]),
    ).toMatchObject({ status: "in_progress", percent: 50 });
  });

  it("counts not-applicable as done and ignores optional items", () => {
    expect(
      checklistProgress([
        { required: true, state: "uploaded" },
        { required: true, state: "not_applicable" },
        { required: false, state: "needed" },
      ]),
    ).toMatchObject({ status: "complete", percent: 100 });
  });

  it("is in progress when only an optional item is uploaded", () => {
    expect(
      checklistProgress([
        { required: true, state: "needed" },
        { required: false, state: "uploaded" },
      ]),
    ).toMatchObject({ status: "in_progress", percent: 0 });
  });

  it("handles an empty checklist", () => {
    expect(checklistProgress([])).toMatchObject({ status: "not_started", percent: 0 });
  });
});
