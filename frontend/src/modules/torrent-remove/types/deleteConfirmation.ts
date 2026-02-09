export type DeleteConfirmationOutcome =
    | { status: "success" }
    | { status: "canceled" }
    | { status: "unsupported" }
    | { status: "failed" };
