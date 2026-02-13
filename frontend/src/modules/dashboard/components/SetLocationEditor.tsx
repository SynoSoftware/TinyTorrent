import { Button, Input } from "@heroui/react";
import { HardDrive } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TEXT_ROLE } from "@/config/textRoles";
import { FORM } from "@/shared/ui/layout/glass-surface";

interface SetLocationEditorProps {
    value: string;
    error?: string;
    isBusy: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    helpText?: string;
    caption?: string;
    statusMessage?: string;
    disableCancel?: boolean;
}
export function SetLocationEditor({
    value,
    error,
    isBusy,
    onChange,
    onSubmit,
    onCancel,
    helpText,
    caption,
    statusMessage,
    disableCancel,
}: SetLocationEditorProps) {
    const { t } = useTranslation();
    const trimmedValue = value.trim();
    return (
        <div className={FORM.locationEditorRoot}>
            {caption && (
                <div className={FORM.locationEditorCaption}>{caption}</div>
            )}
            <div className={FORM.locationEditorRow}>
                <div className={FORM.locationEditorIconWrap}>
                    <HardDrive className={FORM.locationEditorIcon} />
                </div>
                <div className={FORM.locationEditorField}>
                    <label className={TEXT_ROLE.caption}>
                        {t("directory_browser.path_label")}
                    </label>
                    <Input
                        className={TEXT_ROLE.codeMuted}
                        value={value}
                        spellCheck="false"
                        onChange={(event) => onChange(event.target.value)}
                    />
                </div>
            </div>
            <p className={TEXT_ROLE.bodySmall}>
                {helpText ?? t("directory_browser.manual_entry_prompt")}
            </p>
            {statusMessage && (
                <div className={TEXT_ROLE.bodySmall}>{statusMessage}</div>
            )}
            <div className={FORM.locationEditorActions}>
                <Button
                    variant="shadow"
                    size="md"
                    color="primary"
                    onPress={onSubmit}
                    isDisabled={!trimmedValue || isBusy}
                >
                    {t("recovery.action.change_location")}
                </Button>
                <Button
                    variant="light"
                    size="md"
                    color="default"
                    onPress={onCancel}
                    isDisabled={isBusy || disableCancel}
                >
                    {t("modals.cancel")}
                </Button>
            </div>
            {error && <div className={FORM.locationEditorError}>{error}</div>}
        </div>
    );
}
