import { Input } from "@heroui/react";
import { useRef } from "react";
import type { ComponentProps } from "react";

type InputProps = ComponentProps<typeof Input>;

interface BufferedInputProps
    extends Omit<InputProps, "value" | "onChange" | "onBlur" | "onKeyDown"> {
    value: string;
    onValueChange: (next: string) => void;
    onCommit: (next: string) => void | Promise<void>;
    onRevert?: () => void;
}

export function BufferedInput({
    value,
    onValueChange,
    onCommit,
    onRevert,
    ...props
}: BufferedInputProps) {
    const skipNextBlurCommitRef = useRef(false);

    return (
        <Input
            {...props}
            value={value}
            onChange={(event) => {
                onValueChange(event.target.value);
            }}
            onBlur={() => {
                if (skipNextBlurCommitRef.current) {
                    skipNextBlurCommitRef.current = false;
                    return;
                }
                void onCommit(value);
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    void onCommit(value);
                    return;
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    skipNextBlurCommitRef.current = true;
                    onRevert?.();
                    event.currentTarget.blur();
                }
            }}
        />
    );
}
