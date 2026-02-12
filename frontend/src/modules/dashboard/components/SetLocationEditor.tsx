import { Button, Input } from "@heroui/react";
import { HardDrive } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TEXT_ROLE, withColor, withOpacity } from "@/config/textRoles";
import { FORM_UI_CLASS } from "@/shared/ui/layout/glass-surface";

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
        <div className={FORM_UI_CLASS.locationEditorRoot}>
            {caption && (
                <div className={withOpacity(TEXT_ROLE.headingSection, 70)}>
                    {caption}
                </div>
            )}
            <div className={FORM_UI_CLASS.locationEditorRow}>
                <div className={FORM_UI_CLASS.locationEditorIconWrap}>
                    <HardDrive className={FORM_UI_CLASS.locationEditorIcon} />
                </div>
                <div className={FORM_UI_CLASS.locationEditorField}>
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
                <div className={TEXT_ROLE.bodySmall}>
                    {statusMessage}
                </div>
            )}
            <div className={FORM_UI_CLASS.locationEditorActions}>
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
            {error && (
                <div className={withColor(TEXT_ROLE.caption, "danger")}>{error}</div>
            )}
        </div>
    );
}

