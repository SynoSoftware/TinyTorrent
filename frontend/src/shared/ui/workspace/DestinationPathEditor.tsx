import { Button, ComboBox, Input, ListBox, useFilter, type Key } from "@heroui/react";
import { FolderOpen } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { registry } from "@/config/logic";
import { sanitizeDownloadPathHistory } from "@/shared/domain/downloadPathHistory";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { form, surface } from "@/shared/ui/layout/glass-surface";
import { DiskSpaceGauge } from "@/shared/ui/workspace/DiskSpaceGauge";
const { visuals } = registry;

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
    onValueChange: (value: string) => void;
    label?: string;
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
    feedback?: DestinationPathFeedback;
    browseAction?: BrowseAction;
}

type PathInputProps = {
    id: string;
    value: string;
    historyItems: string[];
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
};

const sameHistoryItems = (left: PathInputProps["historyItems"], right: PathInputProps["historyItems"]) =>
    left.length === right.length && left.every((item, index) => item === right[index]);

const feedbackMessageClass = (tone: Exclude<DestinationPathFeedback, { kind: "gauge" }>["tone"]) =>
    tone === "warning" || tone === "danger" ? form.locationEditorValidationWarning : form.locationEditorValidationHint;

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
}: PathInputProps) {
    const { contains } = useFilter({ sensitivity: "base" });
    const inputRef = useRef<HTMLInputElement | null>(null);
    const isOpenRef = useRef(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(value && historyItems.includes(value) ? value : null);
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
        setSelectedKey(value && historyItems.includes(value) ? value : null);
    }, [historyItems, value]);
    useEffect(() => {
        if (!autoFocus) {
            return;
        }
        const frame = window.requestAnimationFrame(() => {
            const input = inputRef.current;
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
    const handleInputChange = useCallback((nextValue: string) => {
        setSelectedKey(null);
        onValueChangeRef.current(nextValue);
    }, []);
    const handleSelectionChange = useCallback((selection: Key | null) => {
        if (typeof selection !== "string") {
            setSelectedKey(null);
            return;
        }
        setSelectedKey(selection);
        onValueChangeRef.current(selection);
    }, []);
    const handleOpenChange = useCallback((open: boolean) => {
        isOpenRef.current = open;
    }, []);
    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onEscapeRef.current?.();
            return;
        }
        if (event.key !== "Enter" || !onEnterRef.current) {
            return;
        }
        if (isOpenRef.current) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        onEnterRef.current();
    }, []);
    const autocomplete = (
        <ComboBox
            allowsCustomValue
            menuTrigger="input"
            variant="secondary"
            inputValue={value}
            selectedKey={selectedKey}
            isDisabled={isDisabled}
            isInvalid={isInvalid}
            defaultFilter={contains}
            onInputChange={handleInputChange}
            onSelectionChange={handleSelectionChange}
            onOpenChange={handleOpenChange}
            className="min-w-0"
            fullWidth
        >
            <ComboBox.InputGroup className={`${form.locationEditorInputClassNames.inputWrapper} flex min-w-0 items-center gap-tools`}>
                <FolderOpen className={form.locationEditorInputLeadingIcon} />
                <Input
                    ref={inputRef}
                    id={id}
                    aria-label={ariaLabel}
                    className={`${visuals.typography.text.codeMuted} min-w-0 flex-1 bg-transparent`}
                    placeholder={placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    onBlur={() => onBlurRef.current?.()}
                    onKeyDown={handleKeyDown}
                />
                <ComboBox.Trigger aria-label={ariaLabel} className={form.locationEditorInputBrowseButton} />
            </ComboBox.InputGroup>
            {historyItems.length > 0 ? (
                <ComboBox.Popover className={surface.menu.surface}>
                    <ListBox>
                        {historyItems.map((item) => (
                            <ListBox.Item
                                key={item}
                                id={item}
                                textValue={item}
                                className={`${surface.menu.itemClassNames.base} ${visuals.typography.text.codeMuted}`}
                            >
                                {item}
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </ComboBox.Popover>
            ) : null}
        </ComboBox>
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
    prev.manualEntryPrompt === next.manualEntryPrompt);

export function DestinationPathEditor({
    id,
    value,
    history,
    ariaLabel,
    placeholder,
    label,
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
    feedback,
    browseAction,
}: DestinationPathEditorProps) {
    const historyItems = useMemo(() => sanitizeDownloadPathHistory(history, history.length), [history]);
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
        />
    );
    const rawBrowseButton = !browseAction ? null : (
        <Button
            onPress={browseAction.onPress}
            size="md"
            variant="secondary"
            isPending={browseAction.isLoading}
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
        <div className={form.locationEditorValidationRow}>
            <span className={feedbackMessageClass(feedback.tone)}>{feedback.message}</span>
        </div>
    );

    return (
        <div className={form.locationEditorRow} data-destination-editor-root-id={id}>
            <div className={form.locationEditorField}>
                <div className={form.locationEditorPathRow}>
                    {currentPathValue ? (
                        <div className={form.locationEditorInlineRow}>
                            <div className={form.locationEditorLabelColumn}>
                                <span className={form.locationEditorInlineLabel}>{currentPathLabel}</span>
                            </div>
                            <div className={form.locationEditorValueColumn}>
                                <span className={form.locationEditorInlineValue}>{currentPathValue}</span>
                            </div>
                        </div>
                    ) : null}
                    <div className={form.locationEditorLabelInputRow}>
                        <div className={labelColumnClassName ?? form.locationEditorLabelColumn}>
                            <label htmlFor={id} className={visuals.typography.text.caption}>
                                {label}
                            </label>
                        </div>
                        <div className={form.locationEditorValueColumn}>{autocomplete}</div>
                    </div>
                    {browseButton ? (
                        <div className={form.locationEditorActionRow}>
                            <div className={form.locationEditorBrowseWrap}>{browseButton}</div>
                        </div>
                    ) : null}
                </div>
                {feedbackContent ? <div className={form.locationEditorFeedbackSlot}>{feedbackContent}</div> : null}
            </div>
        </div>
    );
}
