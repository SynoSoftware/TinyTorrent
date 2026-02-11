export const isAbortError = (error: unknown): boolean => {
    if (!error) return false;
    try {
        if (typeof error === "object" && error !== null) {
            const candidate = error as { name?: unknown; message?: unknown };
            if (candidate.name === "AbortError") return true;
            return (
                typeof candidate.message === "string" &&
                /abort(ed)?/i.test(candidate.message)
            );
        }
    } catch {
        return false;
    }
    return false;
};
