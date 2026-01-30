import { useCallback, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

/**
 * Encapsulates the default command-palette hotkey behavior.
 *
 * Keeps the palette-open state and hotkey wiring together so the
 * presentational shell can stay declarative.
 */
export function useCommandPalette() {
    const [isOpen, setIsOpen] = useState(false);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

    useHotkeys(
        "cmd+k,ctrl+k",
        (event) => {
            event.preventDefault();
            toggle();
        },
        {
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [toggle]
    );

    return { isOpen, open, close, toggle, setIsOpen };
}
