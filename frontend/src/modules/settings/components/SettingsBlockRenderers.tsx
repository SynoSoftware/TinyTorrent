import { Button, Divider, Select, SelectItem, Slider, Switch, cn, } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import {
    ALT_SPEED_DAY_OPTIONS, type InputBlock, type SectionBlock, } from "@/modules/settings/data/settings-tabs";
import { registry } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { LanguageMenu } from "@/shared/ui/controls/LanguageMenu";
import { FORM } from "@/shared/ui/layout/glass-surface";
import {
    BufferedInput,
    type BufferedInputCommitOutcome,
} from "@/modules/settings/components/BufferedInput";
import {
    useSettingsFormActions,
    useSettingsFormState,
} from "@/modules/settings/context/SettingsFormContext";
const { layout, visuals, ui } = registry;

// TODO: Architectural boundary: SettingsBlockRenderers must be view-only.
// TODO: - No RPC calls, no ShellExtensions calls, no capability inference.
// TODO: - Any “can browse directories / can run system integration” flags must come from the Settings view-model/context (which itself derives from `uiMode = "Full" | "Rpc"`).
// TODO: - Keep these renderers deterministic: render based on `block` schema + current `config` + injected action handlers only.
// TODO: This prevents “random feature gating” from spreading and makes Settings safe for AI edits.

/* --- 1. Primitive Renderers --- */

export function SwitchSliderRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "switch-slider" }>;
}) {
    const { t } = useTranslation();
    const { config, updateConfig } = useSettingsFormState();

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
                    onValueChange={(val) => updateConfig(block.switchKey, val)}
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
        interfaceTab: { isImmersive },
    } = useSettingsFormActions();
    const dependsOn = block.dependsOn;
    const baseDisabled = dependsOn ? !(config[dependsOn] as boolean) : false;
    const blocklistUnsupported =
        block.stateKey === "blocklist_enabled" &&
        !capabilities.blocklistSupported;
    const isDisabled =
        blocklistUnsupported ||
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
                    onValueChange={(val) => updateConfig(block.stateKey, val)}
                    isDisabled={isDisabled}
                />
            </div>
            {blocklistUnsupported && (
                <p className={TEXT_ROLE.caption}>
                    {t("settings.blocklist.unsupported")}
                </p>
            )}
        </div>
    );
}

// Extracted to be reusable by InputPair
export function SingleInputRenderer({ block }: { block: InputBlock }) {
    const { t } = useTranslation();
    const { config, updateConfig, setFieldDraft } = useSettingsFormState();
    const { capabilities, buttonActions, canBrowseDirectories, onBrowse } =
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

    const handleCommit = (val: string): BufferedInputCommitOutcome => {
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
            updateConfig(block.stateKey, num);
            setFieldDraft(block.stateKey, null);
            return { status: "applied" };
        }

        if (val === displayValue) {
            setFieldDraft(block.stateKey, null);
            return { status: "canceled" };
        }
        updateConfig(block.stateKey, val);
        setFieldDraft(block.stateKey, null);
        return { status: "applied" };
    };

    const inputNode = (
        <BufferedInput
            label={t(block.labelKey)}
            labelPlacement="outside"
            placeholder=" "
            size={block.size ?? "md"}
            variant={block.variant ?? "bordered"}
            value={displayValue}
            type={block.inputType}
            isDisabled={isDisabled || blocklistUnsupported}
            onCommit={handleCommit}
            onDraftChange={(next) => setFieldDraft(block.stateKey, next)}
            classNames={FORM.builder.settingsBufferedInputClassNames({
                disabled: isDisabled || blocklistUnsupported,
                mono: isMono,
            })}
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
        return (
            <div className={FORM.inputGroup}>
                {inputNode}
                {blocklistHelper}
            </div>
        );
    }

    return (
        <div className={FORM.inputActionGroup}>
            <div className={FORM.inputActionRow}>
                <div className={FORM.inputActionFill}>{inputNode}</div>
                <Button
                    size="md"
                    variant="shadow"
                    color="primary"
                    onPress={() => {
                        void handleSideAction();
                    }}
                    className={FORM.inputActionButton}
                    isDisabled={sideActionDisabled}
                >
                    {t(sideAction.labelKey)}
                </Button>
            </div>
            {blocklistHelper}
        </div>
    );
}

export function InputPairRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "input-pair" }>;
}) {
    const gridCols = block.inputs.length === 1 ? "grid-cols-1" : "grid-cols-2";
    return (
        <div className={cn(FORM.inputPairGrid, gridCols)}>
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
    const { config, updateConfig } = useSettingsFormState();
    const selectedMask = config["alt_speed_time_day"] as number;

    const toggleDay = (mask: number) => {
        const nextValue =
            selectedMask & mask ? selectedMask & ~mask : selectedMask | mask;
        updateConfig("alt_speed_time_day", nextValue);
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
    const { config, updateConfig } = useSettingsFormState();

    return (
        <Select
            label={t(block.labelKey)}
            labelPlacement="outside"
            size="md"
            variant={block.variant ?? "bordered"}
            selectedKeys={
                config[block.stateKey] !== undefined
                    ? [String(config[block.stateKey])]
                    : []
            }
            classNames={FORM.selectClassNames}
            onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (next) updateConfig(block.stateKey, next);
            }}
        >
            {block.options.map((opt) => (
                <SelectItem key={opt.key}>{t(opt.labelKey)}</SelectItem>
            ))}
        </Select>
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
    return (
        <div className={FORM.languageRow}>
            <div>
                <span className={FORM.interfaceRowTitle}>
                    {t(block.labelKey)}
                </span>
                {block.descriptionKey && (
                    <p className={TEXT_ROLE.caption}>
                        {t(block.descriptionKey)}
                    </p>
                )}
            </div>
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
                <div>
                    <span className={FORM.rawConfigTitle}>
                        {t(block.labelKey)}
                    </span>
                    {block.descriptionKey && (
                        <p className={FORM.rawConfigDescription}>
                            {t(block.descriptionKey)}
                        </p>
                    )}
                </div>
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

