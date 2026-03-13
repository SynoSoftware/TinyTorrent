export const sanitizeDomIdToken = (value: string) =>
    value.replace(/[^A-Za-z0-9_-]+/g, "-");

export const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const tagName = target.tagName;
    if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
    ) {
        return true;
    }

    return (
        target.isContentEditable ||
        target.closest("[contenteditable='true']") !== null
    );
};
