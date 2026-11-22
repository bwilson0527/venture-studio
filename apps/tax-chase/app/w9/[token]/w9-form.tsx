"use client";

import { useActionState, useId, useState, type FormEvent, type ReactNode } from "react";

import {
  US_STATE_CODES,
  W9_CERTIFICATION,
  W9_CLASSIFICATION_CHOICES,
  validateW9Form,
  type W9FormField,
  type W9FormInput,
} from "@studio/core/w9/form";
import { maskTin, type TinType } from "@studio/core/w9/tin";

import type { W9FormState } from "./actions";

type Errors = Partial<Record<W9FormField, string>>;

type Props = {
  action: (state: W9FormState, formData: FormData) => Promise<W9FormState>;
  firmName: string;
  businessName: string;
  existing: { at: string; tinType: TinType; tinLast4: string } | null;
};

const LINE_3B = new Set(["partnership", "trust_estate"]);

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-base " +
  "outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/15 " +
  "aria-[invalid=true]:border-red-600 dark:border-neutral-700 dark:focus:border-neutral-100 " +
  "dark:focus:ring-neutral-100/20";

function readForm(form: HTMLFormElement): W9FormInput {
  return Object.fromEntries(
    [...new FormData(form)].filter(([, value]) => typeof value === "string"),
  ) as W9FormInput;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });
}

function Field(props: {
  name: W9FormField;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = props.hint ? `${id}-hint` : undefined;
  const errorId = props.error ? `${id}-error` : undefined;
  return (
    <div className={props.className}>
      <label htmlFor={id} className="block text-sm font-medium">
        {props.label}
        {props.optional ? (
          <span className="font-normal text-neutral-500"> (optional)</span>
        ) : null}
      </label>
      {props.hint ? (
        <p id={hintId} className="mt-0.5 text-sm text-neutral-500">
          {props.hint}
        </p>
      ) : null}
      {props.children({
        id,
        describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined,
        invalid: Boolean(props.error),
      })}
      {props.error ? (
        <p id={errorId} className="mt-1 text-sm text-red-700 dark:text-red-400">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
      <div className="mt-4 space-y-5">{props.children}</div>
    </section>
  );
}

export function W9Form({ action, firmName, businessName, existing }: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [correcting, setCorrecting] = useState(false);
  const [clientErrors, setClientErrors] = useState<Errors | null>(null);

  const saved = state.status === "invalid" || state.status === "failed" ? state.values : {};
  const [classification, setClassification] = useState(saved.classification ?? "");
  const [llc, setLlc] = useState(saved.llcClassification ?? "");
  const [tinType, setTinType] = useState(saved.tinType ?? "");
  const [backupWithholding, setBackupWithholding] = useState(false);

  if (state.status === "done") {
    return (
      <section className="mt-8 rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
        <h2 className="text-lg font-semibold" role="status">
          Thank you. Your W-9 has been received.
        </h2>
        <p className="mt-2 text-sm">
          Signed by {state.signedName} on {formatDate(state.signedAt)}, with taxpayer ID{" "}
          {maskTin(state.tinType, state.tinLast4)}. {firmName} has been given your form and you will
          not get any more reminders. You can close this page.
        </p>
        <p className="mt-2 text-sm">
          If you spot a mistake later, open the same link again to send a corrected form.
        </p>
      </section>
    );
  }

  if (existing && !correcting) {
    return (
      <section className="mt-8 rounded-lg border border-neutral-300 p-5 dark:border-neutral-700">
        <h2 className="text-lg font-semibold">Your W-9 is already on file</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          It was signed on {formatDate(existing.at)} with taxpayer ID{" "}
          {maskTin(existing.tinType, existing.tinLast4)}. There is nothing more to do unless
          something on it has changed or was wrong.
        </p>
        <button
          type="button"
          onClick={() => setCorrecting(true)}
          className="mt-4 rounded-md border border-neutral-400 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-900"
        >
          Send a corrected W-9
        </button>
      </section>
    );
  }

  const errors: Errors = clientErrors ?? (state.status === "invalid" ? state.errors : {});
  const errorCount = Object.keys(errors).length;
  const showLine3b = LINE_3B.has(classification) || (classification === "llc" && llc === "P");

  // The same checks run on the server. Running them here first keeps what the
  // payee typed in place instead of round-tripping a half-finished form.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateW9Form(readForm(event.currentTarget));
    if (result.ok) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    setClientErrors(result.errors);
    requestAnimationFrame(() => document.getElementById("w9-problems")?.focus());
  }

  // Once problems are showing, clear each one as soon as it is fixed.
  function handleChange(event: FormEvent<HTMLFormElement>) {
    if (errorCount === 0) return;
    const result = validateW9Form(readForm(event.currentTarget));
    setClientErrors(result.ok ? {} : result.errors);
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      onChange={handleChange}
      noValidate
      className="mt-2"
    >
      {state.status === "failed" ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
        >
          {state.message}
        </p>
      ) : null}
      {errorCount > 0 ? (
        <p
          id="w9-problems"
          tabIndex={-1}
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 outline-none dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
        >
          {errorCount === 1
            ? "One answer needs another look. It is marked below."
            : `${errorCount} answers need another look. They are marked below.`}
        </p>
      ) : null}

      <Section title="Who you are">
        <Field
          name="legalName"
          label="Name"
          hint="As shown on your income tax return. A sole proprietor enters their own name here, not the business name."
          error={errors.legalName}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="legalName"
              defaultValue={saved.legalName}
              autoComplete="name"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          name="businessName"
          label="Business name"
          hint="Only if it is different from the name above."
          optional
          error={errors.businessName}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="businessName"
              defaultValue={saved.businessName}
              autoComplete="organization"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className={inputClass}
            />
          )}
        </Field>

        <fieldset aria-describedby={errors.classification ? "classification-error" : undefined}>
          <legend className="text-sm font-medium">Federal tax classification</legend>
          <p className="mt-0.5 text-sm text-neutral-500">
            Choose the one that describes the name above. A single-member LLC that is not taxed as a
            corporation chooses its owner&apos;s classification, not LLC.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {W9_CLASSIFICATION_CHOICES.map((choice) => (
              <label
                key={choice.value}
                className="flex items-center gap-2.5 rounded-md border border-neutral-300 px-3 py-2 text-sm has-checked:border-neutral-900 has-checked:bg-neutral-100 dark:border-neutral-700 dark:has-checked:border-neutral-100 dark:has-checked:bg-neutral-900"
              >
                <input
                  type="radio"
                  name="classification"
                  value={choice.value}
                  checked={classification === choice.value}
                  onChange={() => setClassification(choice.value)}
                />
                {choice.label}
              </label>
            ))}
          </div>
          {errors.classification ? (
            <p id="classification-error" className="mt-1 text-sm text-red-700 dark:text-red-400">
              {errors.classification}
            </p>
          ) : null}
        </fieldset>

        {classification === "llc" ? (
          <Field
            name="llcClassification"
            label="How is the LLC taxed?"
            error={errors.llcClassification}
          >
            {({ id, describedBy, invalid }) => (
              <select
                id={id}
                name="llcClassification"
                value={llc}
                onChange={(event) => setLlc(event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={inputClass}
              >
                <option value="">Choose one</option>
                <option value="C">C corporation</option>
                <option value="S">S corporation</option>
                <option value="P">Partnership</option>
              </select>
            )}
          </Field>
        ) : null}

        {classification === "other" ? (
          <Field
            name="otherClassification"
            label="Describe your classification"
            error={errors.otherClassification}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                name="otherClassification"
                defaultValue={saved.otherClassification}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={inputClass}
              />
            )}
          </Field>
        ) : null}

        {showLine3b ? (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="hasForeignPartners"
              defaultChecked={saved.hasForeignPartners === "on"}
              className="mt-1"
            />
            <span>
              We are giving this form to a partnership, trust or estate in which we hold an
              ownership interest, and we have foreign partners, owners or beneficiaries.
              <span className="block text-neutral-500">Most vendors leave this unchecked.</span>
            </span>
          </label>
        ) : null}
      </Section>

      <Section title="Address">
        <Field name="addressLine1" label="Street address" error={errors.addressLine1}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="addressLine1"
              defaultValue={saved.addressLine1}
              autoComplete="address-line1"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          name="addressLine2"
          label="Apartment, suite or unit"
          optional
          error={errors.addressLine2}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="addressLine2"
              defaultValue={saved.addressLine2}
              autoComplete="address-line2"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className={inputClass}
            />
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-[1fr_7rem_9rem]">
          <Field name="city" label="City" error={errors.city}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                name="city"
                defaultValue={saved.city}
                autoComplete="address-level2"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={inputClass}
              />
            )}
          </Field>
          <Field name="state" label="State" error={errors.state}>
            {({ id, describedBy, invalid }) => (
              <select
                id={id}
                name="state"
                defaultValue={saved.state?.toUpperCase() ?? ""}
                autoComplete="address-level1"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={inputClass}
              >
                <option value="">Choose</option>
                {US_STATE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field name="postalCode" label="ZIP code" error={errors.postalCode}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                name="postalCode"
                defaultValue={saved.postalCode}
                autoComplete="postal-code"
                inputMode="numeric"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={inputClass}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Taxpayer identification number">
        <fieldset aria-describedby={errors.tinType ? "tin-type-error" : undefined}>
          <legend className="text-sm font-medium">Which number are you giving?</legend>
          <p className="mt-0.5 text-sm text-neutral-500">
            It must match the name above. Individuals and sole proprietors usually give a Social
            Security number. Corporations, partnerships and most LLCs give an EIN.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["ssn", "Social Security number"],
                ["ein", "Employer Identification Number"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2.5 rounded-md border border-neutral-300 px-3 py-2 text-sm has-checked:border-neutral-900 has-checked:bg-neutral-100 dark:border-neutral-700 dark:has-checked:border-neutral-100 dark:has-checked:bg-neutral-900"
              >
                <input
                  type="radio"
                  name="tinType"
                  value={value}
                  checked={tinType === value}
                  onChange={() => setTinType(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {errors.tinType ? (
            <p id="tin-type-error" className="mt-1 text-sm text-red-700 dark:text-red-400">
              {errors.tinType}
            </p>
          ) : null}
        </fieldset>
        <Field
          name="tin"
          label={tinType === "ein" ? "EIN" : tinType === "ssn" ? "Social Security number" : "Number"}
          hint="Nine digits. It is encrypted before it is stored."
          error={errors.tin}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="tin"
              autoComplete="off"
              inputMode="numeric"
              placeholder={tinType === "ein" ? "00-0000000" : "000-00-0000"}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className={`${inputClass} max-w-56 font-mono tracking-wider`}
            />
          )}
        </Field>
      </Section>

      <details className="mt-10 rounded-md border border-neutral-300 px-4 py-3 dark:border-neutral-700">
        <summary className="cursor-pointer text-sm font-medium">
          Exemption codes (most vendors skip this)
        </summary>
        <div className="mt-4 grid gap-5 pb-2 sm:grid-cols-2">
          <Field
            name="exemptPayeeCode"
            label="Exempt payee code"
            hint="A number from 1 to 13. Applies only to certain entities, not individuals."
            optional
            error={errors.exemptPayeeCode}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                name="exemptPayeeCode"
                defaultValue={saved.exemptPayeeCode}
                inputMode="numeric"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={inputClass}
              />
            )}
          </Field>
          <Field
            name="fatcaCode"
            label="FATCA reporting exemption code"
            hint="A letter from A to M. Applies to accounts maintained outside the United States."
            optional
            error={errors.fatcaCode}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                name="fatcaCode"
                defaultValue={saved.fatcaCode}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={inputClass}
              />
            )}
          </Field>
        </div>
      </details>

      <Section title="Certification">
        <div className="rounded-md border-2 border-neutral-900 p-4 text-sm dark:border-neutral-100">
          <p className="font-semibold">{W9_CERTIFICATION.leadIn}</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            {W9_CERTIFICATION.items.map((item, index) => (
              <li
                key={item}
                className={
                  backupWithholding && index === W9_CERTIFICATION.backupWithholdingItem
                    ? "text-neutral-500 line-through"
                    : undefined
                }
              >
                {item}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">Certification instructions.</span>{" "}
            {W9_CERTIFICATION.crossOutInstruction}
          </p>
          <label className="mt-2 flex items-start gap-2.5">
            <input
              type="checkbox"
              name="backupWithholding"
              checked={backupWithholding}
              onChange={(event) => setBackupWithholding(event.target.checked)}
              className="mt-1"
            />
            <span>
              The IRS has notified me that I am currently subject to backup withholding. Cross out
              item 2.
            </span>
          </label>
          <p className="mt-3 text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">Definition of a U.S. person.</span>{" "}
            {W9_CERTIFICATION.usPersonDefinition}
          </p>
        </div>

        <div>
          <label className="flex items-start gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              name="certify"
              aria-invalid={Boolean(errors.certify)}
              aria-describedby={errors.certify ? "certify-error" : undefined}
              className="mt-1"
            />
            <span>
              Under penalties of perjury, I certify the statements above, and I agree that typing my
              name below is my electronic signature on this {W9_CERTIFICATION.formRevision}.
            </span>
          </label>
          {errors.certify ? (
            <p id="certify-error" className="mt-1 text-sm text-red-700 dark:text-red-400">
              {errors.certify}
            </p>
          ) : null}
        </div>

        <Field
          name="signedName"
          label="Signature of U.S. person"
          hint={`Type your full name. Today's date is recorded with it. You are signing for ${businessName}'s records.`}
          error={errors.signedName}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="signedName"
              defaultValue={saved.signedName}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className={`${inputClass} font-serif text-lg italic`}
            />
          )}
        </Field>
        <p className="text-xs text-neutral-500">{W9_CERTIFICATION.consentStatement}</p>
      </Section>

      <button
        type="submit"
        disabled={pending}
        className="mt-8 w-full rounded-md bg-neutral-900 px-5 py-3 text-base font-semibold text-white hover:bg-neutral-700 disabled:opacity-60 sm:w-auto dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {pending ? "Sending…" : "Sign and send my W-9"}
      </button>
    </form>
  );
}
