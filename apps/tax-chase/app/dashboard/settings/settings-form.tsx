"use client";

import { useActionState } from "react";

import { saveSettings } from "../actions";
import { FormStatus } from "../form-status";
import { inputClass, primaryButton } from "../styles";

export function SettingsForm({
  name,
  replyToEmail,
  timeZone,
  timeZones,
}: {
  name: string;
  replyToEmail: string;
  timeZone: string;
  timeZones: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveSettings, { status: "idle" });
  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="settings-name" className="block text-sm font-medium">
          Firm name
        </label>
        <input id="settings-name" name="name" required maxLength={200} defaultValue={name} className={`mt-1 ${inputClass}`} />
        <p className="mt-1 text-xs text-muted">Vendors see this in the emails asking for their W-9.</p>
      </div>
      <div>
        <label htmlFor="settings-reply" className="block text-sm font-medium">
          Reply-to address <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="settings-reply"
          name="replyToEmail"
          type="email"
          defaultValue={replyToEmail}
          className={`mt-1 ${inputClass}`}
        />
        <p className="mt-1 text-xs text-muted">
          When a vendor replies to a request, the reply goes here. Use an inbox your team reads.
        </p>
      </div>
      <div>
        <label htmlFor="settings-zone" className="block text-sm font-medium">
          Time zone
        </label>
        <select id="settings-zone" name="timeZone" defaultValue={timeZone} className={`mt-1 ${inputClass}`}>
          {timeZones.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Emails to vendors go out between 9am and 6pm in this zone.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
