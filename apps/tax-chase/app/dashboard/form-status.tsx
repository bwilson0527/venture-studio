import Link from "next/link";

import type { FormState } from "./actions";
import { errorText } from "./styles";

/** The line under a form that says whether it worked. */
export function FormStatus({ state }: { state: FormState }) {
  if (state.status === "error") {
    return (
      <p role="alert" className={errorText}>
        {state.message}
        {state.upgrade ? (
          <>
            {" "}
            <Link href="/dashboard/plan" className="font-medium underline">
              See plans
            </Link>
          </>
        ) : null}
      </p>
    );
  }
  if (state.status === "done") {
    return (
      <p role="status" className="text-sm text-accent">
        {state.message}
      </p>
    );
  }
  return null;
}
