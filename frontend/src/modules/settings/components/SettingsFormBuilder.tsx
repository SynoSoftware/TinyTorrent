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

type BlockRendererMap = {
    [K in SectionBlock["type"]]: (props: {
        block: Extract<SectionBlock, { type: K }>;
    }) => ReactNode;
};

const BLOCK_COMPONENTS: BlockRendererMap = {
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

function renderBlock(block: SectionBlock, blockIndex: number) {
    switch (block.type) {
        case "switch-slider": {
            const Renderer = BLOCK_COMPONENTS["switch-slider"];
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "switch": {
            const Renderer = BLOCK_COMPONENTS.switch;
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "input": {
            const Renderer = BLOCK_COMPONENTS.input;
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "input-pair": {
            const Renderer = BLOCK_COMPONENTS["input-pair"];
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "select": {
            const Renderer = BLOCK_COMPONENTS.select;
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "day-selector": {
            const Renderer = BLOCK_COMPONENTS["day-selector"];
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "button-row": {
            const Renderer = BLOCK_COMPONENTS["button-row"];
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "language": {
            const Renderer = BLOCK_COMPONENTS.language;
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "raw-config": {
            const Renderer = BLOCK_COMPONENTS["raw-config"];
            return (
                <Renderer key={`${block.type}-${blockIndex}`} block={block} />
            );
        }
        case "divider": {
            const Renderer = BLOCK_COMPONENTS.divider;
            return <Renderer key={`${block.type}-${blockIndex}`} block={block} />;
        }
        default:
            return null;
    }
}

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
                            {visibleBlocks.map((block, blockIndex) =>
                                renderBlock(block, blockIndex)
                            )}
                        </div>
                    </SettingsSection>
                );
            })}
        </>
    );
}
