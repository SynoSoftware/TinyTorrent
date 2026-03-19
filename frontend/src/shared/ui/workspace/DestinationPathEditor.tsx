import { Autocomplete, AutocompleteItem, Button } from "@heroui/react";
import { FolderOpen } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type Key, type KeyboardEvent } from "react";
import { sanitizeDownloadPathHistory } from "@/shared/domain/downloadPathHistory";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { FORM } from "@/shared/ui/layout/glass-surface";
import { DiskSpaceGauge } from "@/shared/ui/workspace/DiskSpaceGauge";

export type DestinationPathFeedback =
    | { kind: "gauge"; freeSpace: { path: string; sizeBytes: number; totalSize: number } }
    | { kind: "message"; message: string; tone: "hint" | "ok" | "warning" | "danger" };

type BrowseAction = {
    ariaLabel: string;
    label: string;
    onPress: () => void;
    isLoading?: boolean;
    isDisabled?: boolean;
};

interface DestinationPathEditorProps {
    id: string;
    value: string;
    history: string[];
    ariaLabel: string;
    placeholder: string;
    inputClassNames: Record<string, string>;
    onValueChange: (value: string) => void;
    label?: string;
    labelClassName?: string;
    labelColumnClassName?: string;
    currentPathLabel?: string;
    currentPathValue?: string;
    onEnter?: () => void;
    onEscape?: () => void;
    onBlur?: () => void;
    autoFocus?: boolean;
    selectOnFocus?: boolean;
    isDisabled?: boolean;
    isInvalid?: boolean;
    manualEntryPrompt?: string;
    inputTextClassName?: string;
    feedback?: DestinationPathFeedback;
    browseAction?: BrowseAction;
}

type AutocompleteProps = {
    id: string;
    value: string;
    historyItems: Array<{ key: string; label: string }>;
    ariaLabel: string;
    placeholder: string;
    onValueChange: (value: string) => void;
    onEnter?: () => void;
    onEscape?: () => void;
    onBlur?: () => void;
    autoFocus: boolean;
    selectOnFocus: boolean;
    isDisabled: boolean;
    isInvalid: boolean;
    manualEntryPrompt?: string;
    inputClassNames: Record<string, string>;
    inputTextClassName?: string;
};

const sameHistoryItems = (left: AutocompleteProps["historyItems"], right: AutocompleteProps["historyItems"]) =>
    left.length === right.length && left.every((item, index) => item.key === right[index]?.key && item.label === right[index]?.label);

const feedbackMessageClass = (tone: Exclude<DestinationPathFeedback, { kind: "gauge" }>["tone"]) =>
    tone === "warning" || tone === "danger" ? FORM.locationEditorValidationWarning : FORM.locationEditorValidationHint;

const PathAutocomplete = memo(function PathAutocomplete({
    id,
    value,
    historyItems,
    ariaLabel,
    placeholder,
    onValueChange,
    onEnter,
    onEscape,
    onBlur,
    autoFocus,
    selectOnFocus,
    isDisabled,
    isInvalid,
    manualEntryPrompt,
    inputClassNames,
    inputTextClassName,
}: AutocompleteProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const onValueChangeRef = useRef(onValueChange);
    const onEnterRef = useRef(onEnter);
    const onEscapeRef = useRef(onEscape);
    const onBlurRef = useRef(onBlur);
    useEffect(() => {
        onValueChangeRef.current = onValueChange;
        onEnterRef.current = onEnter;
        onEscapeRef.current = onEscape;
        onBlurRef.current = onBlur;
    }, [onBlur, onEnter, onEscape, onValueChange]);
    useEffect(() => {
        if (!autoFocus) {
            return;
        }
        const frame = window.requestAnimationFrame(() => {
            const input = rootRef.current?.querySelector("input");
            if (!(input instanceof HTMLInputElement)) {
                return;
            }
            input.focus();
            if (selectOnFocus) {
                input.select();
            }
        });
        return () => window.cancelAnimationFrame(frame);
    }, [autoFocus, selectOnFocus]);
    const filteredHistoryItems = useMemo(() => {
        const needle = value.trim().toLocaleLowerCase();
        if (!needle) {
            return historyItems;
        }
        return historyItems.filter((item) =>
            item.label.toLocaleLowerCase().includes(needle),
        );
    }, [historyItems, value]);
    const handleInputChange = useCallback((nextValue: string) => {
        setSelectedKey(null);
        onValueChangeRef.current(nextValue);
    }, []);
    const handleSelectionChange = useCallback((selection: Key | null) => {
        if (typeof selection !== "string") {
            return;
        }
        setSelectedKey(selection);
        setIsMenuOpen(false);
        onValueChangeRef.current(selection);
    }, []);
    const handleOpenChange = useCallback((open: boolean) => {
        setIsMenuOpen(open);
    }, []);
    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setIsMenuOpen(false);
            onEscapeRef.current?.();
            return;
        }
        if (event.key !== "Enter" || !onEnterRef.current) {
            return;
        }
        if (isMenuOpen && filteredHistoryItems.length > 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        onEnterRef.current();
    }, [filteredHistoryItems.length, isMenuOpen]);
    const autocomplete = (
        <div ref={rootRef}>
            <Autocomplete
                id={id}
                aria-label={ariaLabel}
                className={inputTextClassName}
                items={filteredHistoryItems}
                inputValue={value}
                selectedKey={selectedKey}
                inputProps={{
                    classNames: inputClassNames,
                    startContent: <FolderOpen className={FORM.locationEditorInputLeadingIcon} />,
                }}
                onInputChange={handleInputChange}
                onSelectionChange={handleSelectionChange}
                onBlur={() => onBlurRef.current?.()}
                allowsCustomValue
                isDisabled={isDisabled}
                isInvalid={isInvalid}
                variant="flat"
                placeholder={placeholder}
                spellCheck="false"
                autoComplete="off"
                menuTrigger="input"
                allowsEmptyCollection={false}
                onOpenChange={handleOpenChange}
                onKeyDown={handleKeyDown}
            >
                {(item) => <AutocompleteItem key={item.key}>{item.label}</AutocompleteItem>}
            </Autocomplete>
        </div>
    );

    return typeof manualEntryPrompt === "string" && manualEntryPrompt.trim().length > 0 ? (
        <AppTooltip content={manualEntryPrompt}>
            {autocomplete}
        </AppTooltip>
    ) : (
        autocomplete
    );
}, (prev, next) => prev.id === next.id &&
    prev.value === next.value &&
    sameHistoryItems(prev.historyItems, next.historyItems) &&
    prev.ariaLabel === next.ariaLabel &&
    prev.placeholder === next.placeholder &&
    prev.autoFocus === next.autoFocus &&
    prev.selectOnFocus === next.selectOnFocus &&
    prev.isDisabled === next.isDisabled &&
    prev.isInvalid === next.isInvalid &&
    prev.manualEntryPrompt === next.manualEntryPrompt &&
    prev.inputClassNames === next.inputClassNames &&
    prev.inputTextClassName === next.inputTextClassName);

export function DestinationPathEditor({
    id,
    value,
    history,
    ariaLabel,
    placeholder,
    label,
    labelClassName,
    labelColumnClassName,
    currentPathLabel,
    currentPathValue,
    onValueChange,
    onEnter,
    onEscape,
    onBlur,
    autoFocus = false,
    selectOnFocus = true,
    isDisabled = false,
    isInvalid = false,
    manualEntryPrompt,
    inputClassNames,
    inputTextClassName,
    feedback,
    browseAction,
}: DestinationPathEditorProps) {
    const historyItems = useMemo(
        () => sanitizeDownloadPathHistory(history, history.length).map((entry) => ({ key: entry, label: entry })),
        [history],
    );
    const autocomplete = (
        <PathAutocomplete
            id={id}
            value={value}
            historyItems={historyItems}
            ariaLabel={ariaLabel}
            placeholder={placeholder}
            onValueChange={onValueChange}
            onEnter={onEnter}
            onEscape={onEscape}
            onBlur={onBlur}
            autoFocus={autoFocus}
            selectOnFocus={selectOnFocus}
            isDisabled={isDisabled}
            isInvalid={isInvalid}
            manualEntryPrompt={manualEntryPrompt}
            inputClassNames={inputClassNames}
            inputTextClassName={inputTextClassName}
        />
    );
    const rawBrowseButton = !browseAction ? null : (
        <Button
            onPress={browseAction.onPress}
            size="md"
            variant="flat"
            isLoading={browseAction.isLoading}
            isDisabled={isDisabled || browseAction.isDisabled}
            aria-label={browseAction.ariaLabel}
        >
            {browseAction.label}
        </Button>
    );
    const browseButton = rawBrowseButton;
    const feedbackContent = !feedback ? null : feedback.kind === "gauge" ? (
        <DiskSpaceGauge
            path={feedback.freeSpace.path}
            freeBytes={feedback.freeSpace.sizeBytes}
            totalBytes={feedback.freeSpace.totalSize}
        />
    ) : (
        <div className={FORM.locationEditorValidationRow}>
            <span className={feedbackMessageClass(feedback.tone)}>{feedback.message}</span>
        </div>
    );

    return (
        <div className={FORM.locationEditorRow} data-destination-editor-root-id={id}>
            <div className={FORM.locationEditorField}>
                <div className={FORM.locationEditorPathRow}>
                    {currentPathValue ? (
                        <div className={FORM.locationEditorInlineRow}>
                            <div className={FORM.locationEditorLabelColumn}>
                                <span className={FORM.locationEditorInlineLabel}>{currentPathLabel}</span>
                            </div>
                            <div className={FORM.locationEditorValueColumn}>
                                <span className={FORM.locationEditorInlineValue}>{currentPathValue}</span>
                            </div>
                        </div>
                    ) : null}
                    <div className={FORM.locationEditorLabelInputRow}>
                        <div className={labelColumnClassName ?? FORM.locationEditorLabelColumn}>
                            <label htmlFor={id} className={labelClassName ?? FORM.locationEditorInlineLabel}>
                                {label}
                            </label>
                        </div>
                        <div className={FORM.locationEditorValueColumn}>{autocomplete}</div>
                    </div>
                    {browseButton ? (
                        <div className={FORM.locationEditorActionRow}>
                            <div className={FORM.locationEditorBrowseWrap}>{browseButton}</div>
                        </div>
                    ) : null}
                </div>
                {feedbackContent ? <div className={FORM.locationEditorFeedbackSlot}>{feedbackContent}</div> : null}
            </div>
        </div>
    );
}
