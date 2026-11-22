import type { Tone } from "@studio/core/w9/vendor-status";

/** Class names shared by the dashboard's forms and badges. */

export const inputClass =
  "block w-full rounded-md border border-line bg-surface px-3 py-2 text-base outline-none " +
  "focus:border-foreground focus:ring-2 focus:ring-foreground/15";

export const primaryButton =
  "rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60";

export const quietButton =
  "rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:border-foreground disabled:opacity-60";

export const errorText = "text-sm text-red-700 dark:text-red-400";

export const toneClass: Record<Tone, string> = {
  done: "bg-accent-soft text-accent",
  wait: "bg-warn-soft text-warn",
  skip: "bg-line/60 text-muted",
};
