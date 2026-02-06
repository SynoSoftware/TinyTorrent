import { useTranslation } from "react-i18next";
import type {
    SectionBlock,
    TabDefinition,
} from "@/modules/settings/data/settings-tabs";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { useSettingsFormState } from "@/modules/settings/context/SettingsFormContext";
import {
    SwitchSliderRenderer,
    SwitchRenderer,
    SingleInputRenderer,
    InputPairRenderer,
    SelectRenderer,
    DaySelectorRenderer,
    ButtonRowRenderer,
    LanguageRenderer,
    RawConfigRenderer,
    DividerRenderer,
} from "@/modules/settings/components/SettingsBlockRenderers";
import type { ReactNode } from "react";

interface SettingsFormBuilderProps {
    tab: TabDefinition;
}

// Strategy Pattern Map
const BLOCK_COMPONENTS: Record<string, (props: { block: any }) => ReactNode> = {
    "switch-slider": SwitchSliderRenderer,
    switch: SwitchRenderer,
    input: SingleInputRenderer,
    "input-pair": InputPairRenderer,
    select: SelectRenderer,
    "day-selector": DaySelectorRenderer,
    "button-row": ButtonRowRenderer,
    language: LanguageRenderer,
    "raw-config": RawConfigRenderer,
    divider: DividerRenderer,
};

export function SettingsFormBuilder({ tab }: SettingsFormBuilderProps) {
    const { t } = useTranslation();
    const { config } = useSettingsFormState();

    return (
        <>
            {tab.sections.map((section, idx) => {
                // Filter hidden blocks
                const visibleBlocks = section.blocks.filter(
                    (block) => !block.visible || block.visible(config)
                );

                if (!visibleBlocks.length) {
                    return null;
                }

                return (
                    <SettingsSection
                        key={idx}
                        className={section.cardClass}
                        title={
                            section.titleKey ? t(section.titleKey) : undefined
                        }
                        description={
                            section.descriptionKey
                                ? t(section.descriptionKey)
                                : undefined
                        }
                    >
                        <div className="space-y-stage mt-panel">
                            {visibleBlocks.map((block, blockIndex) => {
                                const Renderer = BLOCK_COMPONENTS[block.type];
                                if (!Renderer) return null;

                                return (
                                    <Renderer
                                        key={`${block.type}-${blockIndex}`}
                                        block={block}
                                    />
                                );
                            })}
                        </div>
                    </SettingsSection>
                );
            })}
        </>
    );
}
