export type ItemState = "needed" | "uploaded" | "not_applicable";
export type ClientStatus = "not_started" | "in_progress" | "complete" | "paused";

export type ChecklistProgress = {
  status: Exclude<ClientStatus, "paused">;
  /** Required items no longer outstanding, out of all required items. */
  done: number;
  total: number;
  percent: number;
};

/**
 * A client is complete when every required item is uploaded or marked not
 * applicable. Optional items never hold a client back.
 */
export function checklistProgress(
  items: ReadonlyArray<{ required: boolean; state: ItemState }>,
): ChecklistProgress {
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.state !== "needed").length;
  const total = required.length;
  const anyActivity = items.some((i) => i.state !== "needed");

  let status: ChecklistProgress["status"];
  if (total > 0 && done === total) status = "complete";
  else if (total === 0 && anyActivity) status = "complete";
  else if (anyActivity) status = "in_progress";
  else status = "not_started";

  const percent = total === 0 ? (anyActivity ? 100 : 0) : Math.round((done / total) * 100);
  return { status, done, total, percent };
}
