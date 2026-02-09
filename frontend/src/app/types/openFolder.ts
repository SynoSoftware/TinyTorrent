export type OpenFolderOutcome =
    | { status: "opened" }
    | { status: "opened_parent" }
    | { status: "opened_root" }
    | { status: "unsupported" }
    | { status: "missing_path" }
    | { status: "failed" };

export const isOpenFolderSuccess = (outcome: OpenFolderOutcome): boolean =>
    outcome.status === "opened" ||
    outcome.status === "opened_parent" ||
    outcome.status === "opened_root";
