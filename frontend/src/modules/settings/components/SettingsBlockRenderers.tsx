import { Button, Divider, Select, SelectItem, Slider, Switch, cn } from "@heroui/react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMemo, type ReactNode } from "react";
import { type InputBlock, type SectionBlock } from "@/modules/settings/data/settings-tabs";
import type { SettingsConfig } from "@/modules/settings/data/config";
import { registry } from "@/config/logic";
import { LanguageMenu } from "@/shared/ui/controls/LanguageMenu";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { form } from "@/shared/ui/layout/glass-surface";
import { AltSpeedScheduleField } from "@/modules/settings/components/AltSpeedScheduleField";
import { BufferedInput } from "@/modules/settings/components/BufferedInput";
import { useSettingsFormActions, useSettingsFormState } from "@/modules/settings/context/SettingsFormContext";
import type { VersionGatedSettingKey, VersionGatedSettingSupport } from "@/services/rpc/version-support";
const { visuals } = registry;

const isSettingsPathField = (stateKey: string) => stateKey === "download_dir" || stateKey === "incomplete_dir";

function ControlFieldHelper({ helper }: { helper?: ReactNode }) {
    if (!helper) {
        return null;
    }
    return (
        <div className={form.locationEditorFeedbackSlot}>
            <div className={form.locationEditorValidationRow}>{helper}</div>
        </div>
    );
}

function PathFieldHelper({ helper }: { helper?: ReactNode }) {
    if (!helper) {
        return null;
    }
    return (
        <div className={form.locationEditorFeedbackSlot}>
            <div className={form.locationEditorValidationRow}>{helper}</div>
        </div>
    );
}

function InlineSettingsFieldRow({ label, field, helper }: { label: string; field: ReactNode; helper?: ReactNode }) {
    return (
        <div className={form.locationEditorRow}>
            <div className={form.locationEditorField}>
                <div className={form.locationEditorLabelInputRow}>
                    <div className={form.locationEditorLabelColumn}>
                        <span className={form.locationEditorInlineLabel}>{label}</span>
                    </div>
                    <div className={form.locationEditorValueColumn}>{field}</div>
                </div>
                <ControlFieldHelper helper={helper} />
            </div>
        </div>
    );
}

function SettingsControlRow({ label, control, helper }: { label: string; control: ReactNode; helper?: ReactNode }) {
    return (
        <div className={form.systemRow}>
            <div className={form.switchRow}>
                <span className={form.switchLabel}>{label}</span>
                <div className={form.systemRowControl}>{control}</div>
            </div>
            <ControlFieldHelper helper={helper} />
        </div>
    );
}

// TODO: Architectural boundary: SettingsBlockRenderers must be view-only.
// TODO: - No RPC calls, no ShellExtensions calls, no capability inference.
// TODO: - Any “can browse directories / can run system integration” flags must come from the Settings view-model/context (which itself derives from `uiMode = "Full" | "Rpc"`).
// TODO: - Keep these renderers deterministic: render based on `block` schema + current `config` + injected action handlers only.
// TODO: This prevents “random feature gating” from spreading and makes Settings safe for AI edits.

/* --- 1. Primitive Renderers --- */

const getVersionGatedSettingStatus = (stateKey: string, versionGatedSettings: VersionGatedSettingSupport) => {
    if (!(stateKey in versionGatedSettings)) {
        return null;
    }

    return versionGatedSettings[stateKey as VersionGatedSettingKey];
};

const getVersionGatedSettingHint = (
    t: ReturnType<typeof useTranslation>["t"],
    status: NonNullable<ReturnType<typeof getVersionGatedSettingStatus>>,
) =>
    status.state === "unknown"
        ? t("settings.version_gate.detecting")
        : t("settings.version_gate.requires_server", {
              version: status.minimum,
          });

const getVersionGatedControlState = (stateKey: string, versionGatedSettings: VersionGatedSettingSupport) => {
    const status = getVersionGatedSettingStatus(stateKey, versionGatedSettings);
    return {
        status,
        disabled: status != null && status.state !== "supported",
    };
};

export function SwitchSliderRenderer({ block }: { block: Extract<SectionBlock, { type: "switch-slider" }> }) {
    const { t } = useTranslation();
    const { config, fieldStates, updateConfig } = useSettingsFormState();
    const { onApplySetting } = useSettingsFormActions();

    const rawValue = config[block.sliderKey] as number;
    const isSwitchOn = config[block.switchKey] as boolean;
    const switchFieldState = fieldStates[block.switchKey];
    const sliderFieldState = fieldStates[block.sliderKey];
    const blockPending = Boolean(switchFieldState?.pending || sliderFieldState?.pending);
    const blockError = sliderFieldState?.error?.text ?? switchFieldState?.error?.text;
    const sliderDisabled = block.disabledWhenSwitchOff !== false ? !isSwitchOn : false;

    const sliderValue = Number.isFinite(rawValue) ? rawValue : block.slider.min;

    return (
        <div className={form.blockStackTight}>
            <div className={form.blockRowBetween}>
                <Switch
                    size="md"
                    isSelected={isSwitchOn}
                    color={block.color}
                    onValueChange={(val) => {
                        void onApplySetting(block.switchKey, val);
                    }}
                    isDisabled={blockPending}
                >
                    <span className={form.switchSliderLabel}>{t(block.labelKey)}</span>
                </Switch>
                <div className={cn(form.sliderValueText, form.sliderValueBadge)} style={form.sliderValueBadgeStyle}>
                    {block.valueSuffixKey ? t(block.valueSuffixKey, { value: sliderValue }) : sliderValue}
                </div>
            </div>
            <Slider
                size="md"
                step={block.slider.step}
                maxValue={block.slider.max}
                minValue={block.slider.min}
                value={sliderValue}
                onChange={(val) => updateConfig(block.sliderKey, val as number)}
                onChangeEnd={(val) => {
                    const nextValue = Array.isArray(val) ? val[0] : val;
                    if (typeof nextValue === "number") {
                        void onApplySetting(block.sliderKey, nextValue);
                    }
                }}
                isDisabled={sliderDisabled || blockPending}
                color={block.color}
                classNames={form.sliderClassNames}
                className={form.slider}
            />
            <ControlFieldHelper
                helper={blockError ? <p className={form.locationEditorError}>{blockError}</p> : undefined}
            />
        </div>
    );
}

export function SwitchRenderer({ block }: { block: Extract<SectionBlock, { type: "switch" }> }) {
    const { t } = useTranslation();
    const { config, fieldStates } = useSettingsFormState();
    const { capabilities, onApplySetting } = useSettingsFormActions();
    const dependsOn = block.dependsOn;
    const baseDisabled = dependsOn ? !(config[dependsOn] as boolean) : false;
    const blocklistUnsupported = block.stateKey === "blocklist_enabled" && !capabilities.blocklistSupported;
    const { status: versionGatedStatus, disabled: versionGatedDisabled } = getVersionGatedControlState(
        block.stateKey,
        capabilities.versionGatedSettings,
    );
    const fieldError = fieldStates[block.stateKey]?.error?.text;
    const fieldPending = Boolean(fieldStates[block.stateKey]?.pending);
    const isDisabled =
        blocklistUnsupported ||
        versionGatedDisabled ||
        baseDisabled ||
        (block.disabledWhenNotImmersive && config.workspace_style !== "immersive") ||
        fieldPending;

    return (
        <div className={form.switchBlock}>
            <div className={form.switchRow}>
                <span className={cn(form.switchLabel, isDisabled && visuals.state.muted)}>{t(block.labelKey)}</span>
                <Switch
                    size="md"
                    color={block.color}
                    isSelected={config[block.stateKey] as boolean}
                    onValueChange={(val) => {
                        void onApplySetting(block.stateKey, val);
                    }}
                    isDisabled={isDisabled}
                />
            </div>
            <ControlFieldHelper
                helper={
                    fieldError ? (
                        <p className={form.locationEditorError}>{fieldError}</p>
                    ) : blocklistUnsupported ? (
                        <p className={visuals.typography.text.caption}>{t("settings.blocklist.unsupported")}</p>
                    ) : versionGatedStatus && versionGatedDisabled ? (
                        <p className={visuals.typography.text.caption}>
                            {getVersionGatedSettingHint(t, versionGatedStatus)}
                        </p>
                    ) : undefined
                }
            />
        </div>
    );
}

// Extracted to be reusable by InputPair
export function SingleInputRenderer({ block }: { block: InputBlock }) {
    const { t } = useTranslation();
    const { config, fieldStates, setFieldDraft, setFieldError, revertFieldDraft } = useSettingsFormState();
    const { capabilities, buttonActions, canBrowseDirectories, onApplySetting, onBrowse } = useSettingsFormActions();

    const dependsOn = block.dependsOn;
    const isDisabled = dependsOn ? !(config[dependsOn] as boolean) : false;
    const blocklistUnsupported = block.stateKey === "blocklist_url" && !capabilities.blocklistSupported;
    const fieldState = fieldStates[block.stateKey];
    const savedValue = config[block.stateKey];
    const savedDisplayValue = savedValue !== undefined && savedValue !== null ? String(savedValue) : "";
    const displayValue = fieldState?.draft ?? savedDisplayValue;
    const fieldError = fieldState?.error?.text;
    const isPending = Boolean(fieldState?.pending);
    const isMono =
        block.inputType === "number" ||
        (typeof displayValue === "string" && (displayValue.includes("/") || displayValue.includes("\\")));

    // Resolve Side Action
    const sideAction = useMemo(() => {
        if (block.sideAction) return block.sideAction;
        if (block.browseAction)
            return {
                type: "browse" as const,
                labelKey: "settings.button.browse",
                targetConfigKey: block.browseAction,
            };
        return undefined;
    }, [block.sideAction, block.browseAction]);

    const isBrowseAction = sideAction?.type === "browse";
    const isPathField = isSettingsPathField(block.stateKey);
    const isWideInlineField = !isPathField && !sideAction && block.inputType !== "number" && block.inputType !== "time";
    const hideBrowseAction = isBrowseAction && !canBrowseDirectories;
    const sideActionDisabled = isDisabled || hideBrowseAction || blocklistUnsupported || isPending;

    const handleSideAction = async () => {
        if (!sideAction) return;
        if (sideAction.type === "browse" && sideAction.targetConfigKey && !sideActionDisabled) {
            const outcome = await onBrowse(sideAction.targetConfigKey);
            switch (outcome.status) {
                case "applied":
                case "cancelled":
                case "unsupported":
                case "failed":
                    return;
                default:
                    return;
            }
        } else if (sideAction.type === "button" && sideAction.actionKey) {
            buttonActions[sideAction.actionKey]();
        }
    };

    const handleCommit = async (val: string) => {
        if (isPending) {
            return;
        }
        if (block.inputType === "number") {
            if (val === "") {
                setFieldError(block.stateKey, {
                    kind: "validation",
                    text: t("settings.fields.error_invalid_number"),
                });
                return;
            }
            const num = Number(val);
            if (Number.isNaN(num)) {
                setFieldError(block.stateKey, {
                    kind: "validation",
                    text: t("settings.fields.error_invalid_number"),
                });
                return;
            }
            const currentValue = Number(savedDisplayValue);
            if (Number.isFinite(currentValue) && num === currentValue) {
                revertFieldDraft(block.stateKey);
                return;
            }
            await onApplySetting(block.stateKey, num as SettingsConfig[typeof block.stateKey]);
            return;
        }

        if (val === savedDisplayValue) {
            revertFieldDraft(block.stateKey);
            return;
        }
        await onApplySetting(block.stateKey, val as SettingsConfig[typeof block.stateKey]);
    };

    const inputNode = (
        <BufferedInput
            placeholder=" "
            size="md"
            variant={isPathField ? "flat" : (block.variant ?? "bordered")}
            fullWidth={isPathField || isWideInlineField}
            value={displayValue}
            type={block.inputType}
            aria-label={t(block.labelKey)}
            isDisabled={isDisabled || blocklistUnsupported || isPending}
            onValueChange={(next) => setFieldDraft(block.stateKey, next)}
            onCommit={handleCommit}
            onRevert={() => revertFieldDraft(block.stateKey)}
            classNames={
                isPathField
                    ? form.locationEditorInputClassNames
                    : {
                          inputWrapper:
                              isDisabled || blocklistUnsupported || isPending
                                  ? `${form.bufferedInputWrapperBase} ${form.bufferedInputWrapperDisabled}`
                                  : `${form.bufferedInputWrapperBase} ${form.bufferedInputWrapperEnabled}`,
                          input: isMono ? form.bufferedInputTextMono : form.bufferedInputTextDefault,
                          label: form.bufferedInputLabel,
                      }
            }
            startContent={
                isPathField ? (
                    <FolderOpen
                        strokeWidth={visuals.icon.strokeWidth}
                        className={form.locationEditorInputLeadingIcon}
                    />
                ) : undefined
            }
            endContent={
                block.endIcon ? (
                    <block.endIcon strokeWidth={visuals.icon.strokeWidth} className={form.inputEndIcon} />
                ) : undefined
            }
            className={block.className}
        />
    );

    const helperContent = fieldError ? (
        <p className={form.locationEditorError}>{fieldError}</p>
    ) : blocklistUnsupported ? (
        <p className={visuals.typography.text.caption}>{t("settings.blocklist.unsupported")}</p>
    ) : undefined;

    if (!sideAction || hideBrowseAction) {
        if (isPathField) {
            return (
                <div className={form.locationEditorRow}>
                    <div className={form.locationEditorField}>
                        <div className={form.locationEditorPathRow}>
                            <div className={form.locationEditorHeader}>
                                <span className={form.locationEditorInlineLabel}>{t(block.labelKey)}</span>
                            </div>
                            <div className={form.locationEditorInputWrap}>{inputNode}</div>
                        </div>
                        <PathFieldHelper helper={helperContent} />
                    </div>
                </div>
            );
        }
        if (isWideInlineField) {
            return <InlineSettingsFieldRow label={t(block.labelKey)} field={inputNode} helper={helperContent} />;
        }
        return <SettingsControlRow label={t(block.labelKey)} control={inputNode} helper={helperContent} />;
    }

    return isPathField ? (
        <div className={form.locationEditorRow}>
            <div className={form.locationEditorField}>
                <div className={form.locationEditorPathRow}>
                    <div className={form.locationEditorHeader}>
                        <span className={form.locationEditorInlineLabel}>{t(block.labelKey)}</span>
                    </div>
                    <div className={form.locationEditorInputWrap}>{inputNode}</div>
                </div>
                <div className={form.locationEditorActionRow}>
                    <div className={form.locationEditorBrowseWrap}>
                        <Button
                            size="md"
                            variant="flat"
                            onPress={() => {
                                void handleSideAction();
                            }}
                            isDisabled={sideActionDisabled}
                        >
                            {t(sideAction.labelKey)}
                        </Button>
                    </div>
                </div>
                <PathFieldHelper helper={helperContent} />
            </div>
        </div>
    ) : (
        <SettingsControlRow
            label={t(block.labelKey)}
            control={
                <>
                    {inputNode}
                    <Button
                        size="md"
                        variant="bordered"
                        color="primary"
                        onPress={() => {
                            void handleSideAction();
                        }}
                        isDisabled={sideActionDisabled}
                    >
                        {t(sideAction.labelKey)}
                    </Button>
                </>
            }
            helper={helperContent}
        />
    );
}

export function InputPairRenderer({ block }: { block: Extract<SectionBlock, { type: "input-pair" }> }) {
    return (
        <div className={form.blockStackTight}>
            {block.inputs.map((inputBlock, idx) => (
                <SingleInputRenderer key={inputBlock.stateKey || idx} block={inputBlock} />
            ))}
        </div>
    );
}

export function AltSpeedScheduleRenderer({ block }: { block: Extract<SectionBlock, { type: "alt-speed-schedule" }> }) {
    return <AltSpeedScheduleField block={block} />;
}

export function SelectRenderer({ block }: { block: Extract<SectionBlock, { type: "select" }> }) {
    const { t } = useTranslation();
    const { config, fieldStates } = useSettingsFormState();
    const { capabilities, onApplySetting } = useSettingsFormActions();
    const { status: versionGatedStatus, disabled: isDisabled } = getVersionGatedControlState(
        block.stateKey,
        capabilities.versionGatedSettings,
    );
    const fieldError = fieldStates[block.stateKey]?.error?.text;
    const fieldPending = Boolean(fieldStates[block.stateKey]?.pending);

    return (
        <InlineSettingsFieldRow
            label={t(block.labelKey)}
            field={
                <Select
                    size="md"
                    variant={block.variant ?? "bordered"}
                    fullWidth
                    selectedKeys={config[block.stateKey] !== undefined ? [String(config[block.stateKey])] : []}
                    classNames={form.selectClassNames}
                    isDisabled={isDisabled || fieldPending}
                    aria-label={t(block.labelKey)}
                    onSelectionChange={(keys) => {
                        const [next] = [...keys];
                        if (next) {
                            void onApplySetting(block.stateKey, String(next) as SettingsConfig[typeof block.stateKey]);
                        }
                    }}
                >
                    {block.options.map((opt) => (
                        <SelectItem key={opt.key}>{t(opt.labelKey)}</SelectItem>
                    ))}
                </Select>
            }
            helper={
                fieldError ? (
                    <p className={form.locationEditorError}>{fieldError}</p>
                ) : versionGatedStatus && isDisabled ? (
                    <p className={visuals.typography.text.caption}>{getVersionGatedSettingHint(t, versionGatedStatus)}</p>
                ) : null
            }
        />
    );
}

export function ButtonRowRenderer({ block }: { block: Extract<SectionBlock, { type: "button-row" }> }) {
    const { t } = useTranslation();
    const { buttonActions } = useSettingsFormActions();

    return (
        <div className={form.buttonRow}>
            {block.buttons.map((btn) => (
                <Button
                    key={btn.labelKey}
                    size={btn.size ?? "md"}
                    variant={btn.variant ?? "light"}
                    color={btn.color}
                    onPress={buttonActions[btn.action]}
                    className={btn.className}
                >
                    {t(btn.labelKey)}
                </Button>
            ))}
        </div>
    );
}

export function LanguageRenderer({ block }: { block: Extract<SectionBlock, { type: "language" }> }) {
    const { t } = useTranslation();
    const tooltip = block.descriptionKey ? t(block.descriptionKey) : t("settings.descriptions.language");
    return (
        <div className={form.languageRow}>
            <AppTooltip content={tooltip}>
                <span className={form.systemRowLabel}>{t(block.labelKey)}</span>
            </AppTooltip>
            <LanguageMenu />
        </div>
    );
}

export function RawConfigRenderer({ block }: { block: Extract<SectionBlock, { type: "raw-config" }> }) {
    const { t } = useTranslation();
    const { jsonCopyStatus, configJson } = useSettingsFormState();
    const { onCopyConfigJson } = useSettingsFormActions();
    const tooltip = block.descriptionKey
        ? `${t("settings.descriptions.config_export")} ${t(block.descriptionKey)}`
        : t("settings.descriptions.config_export");
    const handleCopy = async () => {
        const outcome = await onCopyConfigJson();
        switch (outcome.status) {
            case "applied":
            case "cancelled":
            case "unsupported":
            case "failed":
                return;
            default:
                return;
        }
    };

    return (
        <div className={form.blockStackTight}>
            <div className={form.rawConfigHeader}>
                <AppTooltip content={tooltip}>
                    <span className={form.systemRowLabel}>{t(block.labelKey)}</span>
                </AppTooltip>
                <Button
                    size="md"
                    variant="shadow"
                    color="primary"
                    onPress={() => {
                        void handleCopy();
                    }}
                >
                    {jsonCopyStatus === "copied"
                        ? t("settings.buttons.copy_config_copied")
                        : jsonCopyStatus === "failed"
                          ? t("settings.buttons.copy_config_failed")
                          : t("settings.buttons.copy_config")}
                </Button>
            </div>
            <div className={form.rawConfigFeedback}>
                {jsonCopyStatus === "copied" && (
                    <p className={form.rawConfigStatusSuccess}>{t("settings.modal.clipboard_success")}</p>
                )}
                {jsonCopyStatus === "failed" && (
                    <p className={form.rawConfigStatusDanger}>{t("settings.modal.clipboard_failed")}</p>
                )}
            </div>
            <div className={form.rawConfigPanel}>
                <textarea
                    className={cn(form.rawConfigCode, form.rawConfigTextarea)}
                    rows={10}
                    value={configJson}
                    readOnly
                    aria-label={t(block.labelKey)}
                />
            </div>
        </div>
    );
}

export function DividerRenderer() {
    return <Divider className={form.divider} />;
}
