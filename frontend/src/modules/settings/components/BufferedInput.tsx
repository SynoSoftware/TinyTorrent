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

    useEffect(() => {
        if (!isEditing) {
            setDraft(value);
        }
    }, [isEditing, value]);

    const commit = useCallback(() => {
        const accepted = onCommit(draft);
        if (accepted === false) {
            setDraft(value);
        }
        setIsEditing(false);
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
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                }
            }}
        />
    );
}
