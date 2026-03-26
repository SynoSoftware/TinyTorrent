import { Button, Divider, Select, SelectItem, Slider, Switch, cn, } from "@heroui/react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMemo, type ReactNode } from "react";
import {
    ALT_SPEED_DAY_OPTIONS, type InputBlock, type SectionBlock, } from "@/modules/settings/data/settings-tabs";
import type { SettingsConfig } from "@/modules/settings/data/config";
import { registry } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { LanguageMenu } from "@/shared/ui/controls/LanguageMenu";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { FORM } from "@/shared/ui/layout/glass-surface";
import {
    BufferedInput,
    type BufferedInputCommitOutcome,
} from "@/modules/settings/components/BufferedInput";
import {
    useSettingsFormActions,
    useSettingsFormState,
} from "@/modules/settings/context/SettingsFormContext";
import type {
    VersionGatedSettingKey,
    VersionGatedSettingSupport,
} from "@/services/rpc/version-support";
const { visuals } = registry;

const isSettingsPathField = (stateKey: string) =>
    stateKey === "download_dir" || stateKey === "incomplete_dir";

function InlineSettingsFieldRow({
    label,
    field,
    helper,
}: {
    label: string;
    field: ReactNode;
    helper?: ReactNode;
}) {
    return (
        <div className={FORM.locationEditorRow}>
            <div className={FORM.locationEditorField}>
                <div className={FORM.locationEditorLabelInputRow}>
                    <div className={FORM.locationEditorLabelColumn}>
                        <span className={FORM.locationEditorInlineLabel}>
                            {label}
                        </span>
                    </div>
                    <div className={FORM.locationEditorValueColumn}>{field}</div>
                </div>
                {helper}
            </div>
        </div>
    );
}

function SettingsControlRow({
    label,
    control,
    helper,
}: {
    label: string;
    control: ReactNode;
    helper?: ReactNode;
}) {
    return (
        <div className={FORM.systemRow}>
            <div className={FORM.switchRow}>
                <span className={FORM.switchLabel}>{label}</span>
                <div className={FORM.systemRowControl}>{control}</div>
            </div>
            {helper}
        </div>
    );
}

// TODO: Architectural boundary: SettingsBlockRenderers must be view-only.
// TODO: - No RPC calls, no ShellExtensions calls, no capability inference.
// TODO: - Any “can browse directories / can run system integration” flags must come from the Settings view-model/context (which itself derives from `uiMode = "Full" | "Rpc"`).
// TODO: - Keep these renderers deterministic: render based on `block` schema + current `config` + injected action handlers only.
// TODO: This prevents “random feature gating” from spreading and makes Settings safe for AI edits.

/* --- 1. Primitive Renderers --- */

const getVersionGatedSettingStatus = (
    stateKey: string,
    versionGatedSettings: VersionGatedSettingSupport,
) => {
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

const getVersionGatedControlState = (
    stateKey: string,
    versionGatedSettings: VersionGatedSettingSupport,
) => {
    const status = getVersionGatedSettingStatus(stateKey, versionGatedSettings);
    return {
        status,
        disabled: status != null && status.state !== "supported",
    };
};

export function SwitchSliderRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "switch-slider" }>;
}) {
    const { t } = useTranslation();
    const { config, updateConfig } = useSettingsFormState();
    const { onApplySetting } = useSettingsFormActions();

    const rawValue = config[block.sliderKey] as number;
    const isSwitchOn = config[block.switchKey] as boolean;
    const sliderDisabled =
        block.disabledWhenSwitchOff !== false ? !isSwitchOn : false;

    const sliderValue = Number.isFinite(rawValue) ? rawValue : block.slider.min;

    return (
        <div className={FORM.blockStackTight}>
            <div className={FORM.blockRowBetween}>
                <Switch
                    size="md"
                    isSelected={isSwitchOn}
                    color={block.color}
                    onValueChange={(val) => {
                        void onApplySetting(block.switchKey, val);
                    }}
                >
                    <span className={FORM.switchSliderLabel}>
                        {t(block.labelKey)}
                    </span>
                </Switch>
                <div
                    className={cn(FORM.sliderValueText, FORM.sliderValueBadge)}
                    style={FORM.sliderValueBadgeStyle}
                >
                    {block.valueSuffixKey
                        ? t(block.valueSuffixKey, { value: sliderValue })
                        : sliderValue}
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
                isDisabled={sliderDisabled}
                color={block.color}
                classNames={FORM.sliderClassNames}
                className={FORM.slider}
            />
        </div>
    );
}

export function SwitchRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "switch" }>;
}) {
    const { t } = useTranslation();
    const { config, updateConfig } = useSettingsFormState();
    const {
        capabilities,
        onApplySetting,
        interfaceTab: { isImmersive },
    } = useSettingsFormActions();
    const dependsOn = block.dependsOn;
    const baseDisabled = dependsOn ? !(config[dependsOn] as boolean) : false;
    const blocklistUnsupported =
        block.stateKey === "blocklist_enabled" &&
        !capabilities.blocklistSupported;
    const { status: versionGatedStatus, disabled: versionGatedDisabled } =
        getVersionGatedControlState(
        block.stateKey,
        capabilities.versionGatedSettings,
    );
    const isDisabled =
        blocklistUnsupported ||
        versionGatedDisabled ||
        baseDisabled ||
        (block.disabledWhenNotImmersive && !isImmersive);

    return (
        <div className={FORM.switchBlock}>
            <div className={FORM.switchRow}>
                <span
                    className={cn(
                        FORM.switchLabel,
                        isDisabled && visuals.state.muted,
                    )}
                >
                    {t(block.labelKey)}
                </span>
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
            {blocklistUnsupported && (
                <p className={TEXT_ROLE.caption}>
                    {t("settings.blocklist.unsupported")}
                </p>
            )}
            {!blocklistUnsupported && versionGatedStatus && isDisabled && (
                <p className={TEXT_ROLE.caption}>
                    {getVersionGatedSettingHint(t, versionGatedStatus)}
                </p>
            )}
        </div>
    );
}

// Extracted to be reusable by InputPair
export function SingleInputRenderer({ block }: { block: InputBlock }) {
    const { t } = useTranslation();
    const { config, setFieldDraft } = useSettingsFormState();
    const {
        capabilities,
        buttonActions,
        canBrowseDirectories,
        onApplySetting,
        onBrowse,
    } =
        useSettingsFormActions();

    const dependsOn = block.dependsOn;
    const isDisabled = dependsOn ? !(config[dependsOn] as boolean) : false;
    const blocklistUnsupported =
        block.stateKey === "blocklist_url" && !capabilities.blocklistSupported;
    const configValue = config[block.stateKey];

    const displayValue =
        configValue !== undefined && configValue !== null
            ? String(configValue)
            : "";
    const isMono =
        block.inputType === "number" ||
        (typeof displayValue === "string" &&
            (displayValue.includes("/") || displayValue.includes("\\")));

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
    const isWideInlineField =
        !isPathField &&
        !sideAction &&
        block.inputType !== "number" &&
        block.inputType !== "time";
    const hideBrowseAction = isBrowseAction && !canBrowseDirectories;
    const sideActionDisabled =
        isDisabled || hideBrowseAction || blocklistUnsupported;

    const handleSideAction = async () => {
        if (!sideAction) return;
        if (
            sideAction.type === "browse" &&
            sideAction.targetConfigKey &&
            !sideActionDisabled
        ) {
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

    const handleCommit = async (
        val: string,
    ): Promise<BufferedInputCommitOutcome> => {
        const toBufferedOutcome = async (
            nextValue: SettingsConfig[typeof block.stateKey],
        ): Promise<BufferedInputCommitOutcome> => {
            const outcome = await onApplySetting(block.stateKey, nextValue);
            switch (outcome.status) {
                case "applied":
                    return { status: "applied" };
                case "unsupported":
                    return { status: "unsupported" };
                case "failed":
                    return { status: "failed" };
                case "cancelled":
                default:
                    return { status: "canceled" };
            }
        };

        if (block.inputType === "number") {
            if (val === "") {
                return { status: "rejected_validation" };
            }
            const num = Number(val);
            if (Number.isNaN(num)) {
                return { status: "rejected_validation" };
            }
            const currentValue = Number(displayValue);
            if (Number.isFinite(currentValue) && num === currentValue) {
                setFieldDraft(block.stateKey, null);
                return { status: "canceled" };
            }
            return toBufferedOutcome(num as SettingsConfig[typeof block.stateKey]);
        }

        if (val === displayValue) {
            setFieldDraft(block.stateKey, null);
            return { status: "canceled" };
        }
        return toBufferedOutcome(val as SettingsConfig[typeof block.stateKey]);
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
            isDisabled={isDisabled || blocklistUnsupported}
            onCommit={handleCommit}
            onDraftChange={(next) => setFieldDraft(block.stateKey, next)}
            classNames={
                isPathField
                    ? FORM.locationEditorInputClassNames
                    : FORM.builder.settingsBufferedInputClassNames({
                          disabled: isDisabled || blocklistUnsupported,
                          mono: isMono,
                      })
            }
            startContent={
                isPathField ? (
                    <FolderOpen
                        strokeWidth={visuals.icon.strokeWidth}
                        className={FORM.locationEditorInputLeadingIcon}
                    />
                ) : undefined
            }
            endContent={
                block.endIcon ? (
                    <block.endIcon
                        strokeWidth={visuals.icon.strokeWidth}
                        className={FORM.inputEndIcon}
                    />
                ) : undefined
            }
            className={block.className}
        />
    );

    const blocklistHelper = blocklistUnsupported ? (
        <p className={TEXT_ROLE.caption}>
            {t("settings.blocklist.unsupported")}
        </p>
    ) : null;

    if (!sideAction || hideBrowseAction) {
        if (isPathField) {
            return (
                <div className={FORM.locationEditorRow}>
                    <div className={FORM.locationEditorField}>
                        <div className={FORM.locationEditorPathRow}>
                            <div className={FORM.locationEditorHeader}>
                                <span className={FORM.locationEditorInlineLabel}>
                                    {t(block.labelKey)}
                                </span>
                            </div>
                            <div className={FORM.locationEditorInputWrap}>
                                {inputNode}
                            </div>
                        </div>
                        {blocklistHelper}
                    </div>
                </div>
            );
        }
        if (isWideInlineField) {
            return (
                <InlineSettingsFieldRow
                    label={t(block.labelKey)}
                    field={inputNode}
                    helper={blocklistHelper}
                />
            );
        }
        return (
            <SettingsControlRow
                label={t(block.labelKey)}
                control={inputNode}
                helper={blocklistHelper}
            />
        );
    }

    return (
        isPathField ? (
            <div className={FORM.locationEditorRow}>
                <div className={FORM.locationEditorField}>
                    <div className={FORM.locationEditorPathRow}>
                        <div className={FORM.locationEditorHeader}>
                            <span className={FORM.locationEditorInlineLabel}>
                                {t(block.labelKey)}
                            </span>
                        </div>
                        <div className={FORM.locationEditorInputWrap}>
                            {inputNode}
                        </div>
                    </div>
                    <div className={FORM.locationEditorActionRow}>
                        <div className={FORM.locationEditorBrowseWrap}>
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
                    {blocklistHelper}
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
                helper={blocklistHelper}
            />
        )
    );
}

export function InputPairRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "input-pair" }>;
}) {
    return (
        <div className={FORM.blockStackTight}>
            {block.inputs.map((inputBlock, idx) => (
                <SingleInputRenderer
                    key={inputBlock.stateKey || idx}
                    block={inputBlock}
                />
            ))}
        </div>
    );
}

export function DaySelectorRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "day-selector" }>;
}) {
    const { t } = useTranslation();
    const { config } = useSettingsFormState();
    const { onApplySetting } = useSettingsFormActions();
    const selectedMask = config["alt_speed_time_day"] as number;

    const toggleDay = (mask: number) => {
        const nextValue =
            selectedMask & mask ? selectedMask & ~mask : selectedMask | mask;
        void onApplySetting("alt_speed_time_day", nextValue);
    };

    return (
        <div className={FORM.blockStackTight}>
            <div className={FORM.blockRowBetween}>
                <span
                    className={TEXT_ROLE.labelDense}
                    style={FORM.trackingWideStyle}
                >
                    {t(block.labelKey)}
                </span>
            </div>
            <div className={FORM.daySelectorList}>
                {ALT_SPEED_DAY_OPTIONS.map((day) => {
                    const isSelected = Boolean(selectedMask & day.mask);
                    return (
                        <Button
                            key={day.id}
                            size="md"
                            variant={isSelected ? "shadow" : "ghost"}
                            color={isSelected ? "primary" : undefined}
                            onPress={() => toggleDay(day.mask)}
                            className={cn(
                                FORM.daySelectorButton,
                                isSelected
                                    ? FORM.daySelectorSelected
                                    : FORM.daySelectorUnselected,
                            )}
                            style={FORM.trackingWideStyle}
                        >
                            {t(day.labelKey).substring(0, 3)}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}

export function SelectRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "select" }>;
}) {
    const { t } = useTranslation();
    const { config } = useSettingsFormState();
    const { capabilities, onApplySetting } = useSettingsFormActions();
    const {
        status: versionGatedStatus,
        disabled: isDisabled,
    } = getVersionGatedControlState(
        block.stateKey,
        capabilities.versionGatedSettings,
    );

    return (
        <InlineSettingsFieldRow
            label={t(block.labelKey)}
            field={
                <Select
                    size="md"
                    variant={block.variant ?? "bordered"}
                    fullWidth
                    selectedKeys={
                        config[block.stateKey] !== undefined
                            ? [String(config[block.stateKey])]
                            : []
                    }
                    classNames={FORM.selectClassNames}
                    isDisabled={isDisabled}
                    aria-label={t(block.labelKey)}
                    onSelectionChange={(keys) => {
                        const [next] = [...keys];
                        if (next) {
                            void onApplySetting(
                                block.stateKey,
                                String(next) as SettingsConfig[typeof block.stateKey],
                            );
                        }
                    }}
                >
                    {block.options.map((opt) => (
                        <SelectItem key={opt.key}>{t(opt.labelKey)}</SelectItem>
                    ))}
                </Select>
            }
            helper={
                versionGatedStatus && isDisabled ? (
                    <p className={TEXT_ROLE.caption}>
                        {getVersionGatedSettingHint(t, versionGatedStatus)}
                    </p>
                ) : null
            }
        />
    );
}

export function ButtonRowRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "button-row" }>;
}) {
    const { t } = useTranslation();
    const { buttonActions } = useSettingsFormActions();

    return (
        <div className={FORM.buttonRow}>
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

export function LanguageRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "language" }>;
}) {
    const { t } = useTranslation();
    const tooltip = block.descriptionKey
        ? t(block.descriptionKey)
        : t("settings.descriptions.language");
    return (
        <div className={FORM.languageRow}>
            <AppTooltip content={tooltip}>
                <span className={FORM.systemRowLabel}>
                    {t(block.labelKey)}
                </span>
            </AppTooltip>
            <LanguageMenu />
        </div>
    );
}

export function RawConfigRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "raw-config" }>;
}) {
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
        <div className={FORM.blockStackTight}>
            <div className={FORM.rawConfigHeader}>
                <AppTooltip content={tooltip}>
                    <span className={FORM.systemRowLabel}>
                        {t(block.labelKey)}
                    </span>
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
            <div className={FORM.rawConfigFeedback}>
                {jsonCopyStatus === "copied" && (
                    <p className={FORM.rawConfigStatusSuccess}>
                        {t("settings.modal.clipboard_success")}
                    </p>
                )}
                {jsonCopyStatus === "failed" && (
                    <p className={FORM.rawConfigStatusDanger}>
                        {t("settings.modal.clipboard_failed")}
                    </p>
                )}
            </div>
            <div className={FORM.rawConfigPanel}>
                <textarea
                    className={cn(FORM.rawConfigCode, FORM.rawConfigTextarea)}
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
    return <Divider className={FORM.divider} />;
}

