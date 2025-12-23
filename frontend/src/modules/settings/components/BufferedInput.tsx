import { Input } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import type { ComponentProps } from "react";

type InputProps = ComponentProps<typeof Input>;

interface BufferedInputProps
    extends Omit<InputProps, "value" | "onChange" | "onBlur" | "onKeyDown"> {
    value: string;
    onCommit: (next: string) => boolean | void;
}

export function BufferedInput({
    value,
    onCommit,
    ...props
}: BufferedInputProps) {
    const [draft, setDraft] = useState(value);
    const [isEditing, setIsEditing] = useState(false);
    const [pendingCommit, setPendingCommit] = useState(false);

    useEffect(() => {
        if (!isEditing && !pendingCommit) {
            setDraft(value);
        }
    }, [isEditing, value, pendingCommit]);

    const commit = useCallback(async () => {
        setPendingCommit(true);
        try {
            const result = onCommit(draft);
            // Support sync or async commit functions. Use duck-typing for Promise.
            if (result && typeof (result as any).then === "function") {
                const awaited = await (result as any);
                if (awaited === false) {
                    setDraft(value);
                }
            } else {
                if (result === false) {
                    setDraft(value);
                }
            }
        } finally {
            setPendingCommit(false);
            setIsEditing(false);
        }
    }, [draft, onCommit, value]);

    return (
        <Input
            {...props}
            value={draft}
            onChange={(event) => {
                setDraft(event.target.value);
            }}
            onFocus={() => {
                setIsEditing(true);
            }}
            onBlur={() => {
                // trigger commit but don't block UI
                void commit();
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                }
            }}
        />
    );
}
