import type { FormState } from "./actions";
import { errorText } from "./styles";

/** The line under a form that says whether it worked. */
export function FormStatus({ state }: { state: FormState }) {
  if (state.status === "error") {
    return (
      <p role="alert" className={errorText}>
        {state.message}
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
