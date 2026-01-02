export function extractErrorMessage(error: unknown): string | null {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string" && error.length) {
        return error;
    }
    if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string" &&
        (error as { message: string }).message
    ) {
        return (error as { message: string }).message;
    }
    return null;
}

export function isFileAccessError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const name = (error as { name?: unknown }).name;
    return name === "NotAllowedError" || name === "SecurityError";
}

