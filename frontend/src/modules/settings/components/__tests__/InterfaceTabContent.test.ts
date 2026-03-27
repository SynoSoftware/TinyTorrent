import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { InterfaceTabContent } from "@/modules/settings/components/InterfaceTabContent";

const useSettingsFormStateMock = vi.hoisted(() => vi.fn());
const useSettingsFormActionsMock = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@heroui/react", () => ({
    Button: ({
        children,
        onPress,
        isDisabled,
        ...props
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
        isDisabled?: boolean;
        [key: string]: unknown;
    }) =>
        React.createElement(
            "button",
            {
                ...props,
                type: "button",
                disabled: isDisabled,
                onClick: onPress,
            },
            children,
        ),
    Switch: ({
        isSelected,
        onValueChange,
        isDisabled,
        ...props
    }: {
        isSelected?: boolean;
        onValueChange?: (value: boolean) => void;
        isDisabled?: boolean;
        [key: string]: unknown;
    }) =>
        React.createElement("input", {
            ...props,
            type: "checkbox",
            checked: Boolean(isSelected),
            disabled: isDisabled,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                onValueChange?.(event.target.checked),
        }),
}));

vi.mock("@/modules/settings/context/SettingsFormContext", () => ({
    useSettingsFormState: useSettingsFormStateMock,
    useSettingsFormActions: useSettingsFormActionsMock,
}));

vi.mock("@/modules/settings/components/SettingsSection", () => ({
    SettingsSection: ({
        children,
        title,
    }: {
        children?: React.ReactNode;
        title: string;
    }) =>
        React.createElement(
            "section",
            null,
            React.createElement("h2", null, title),
            children,
        ),
}));

vi.mock("@/shared/ui/components/AppTooltip", () => ({
    default: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
}));

vi.mock("@/shared/ui/controls/LanguageMenu", () => ({
    LanguageMenu: () => React.createElement("div", null, "language-menu"),
}));

vi.mock("@/modules/settings/components/SettingsBlockRenderers", () => ({
    RawConfigRenderer: () => React.createElement("div", null, "raw-config"),
}));

vi.mock("@/shared/ui/layout/glass-surface", () => ({
    FORM: {
        sectionContentStack: "section-content-stack",
        interfaceRow: "interface-row",
        interfaceRowInfo: "interface-row-info",
        interfaceRowActions: "interface-row-actions",
        systemRowLabel: "system-row-label",
        systemRow: "system-row",
        locationEditorFeedbackSlot: "location-editor-feedback-slot",
        systemRowHelper: "system-row-helper",
        locationEditorError: "location-editor-error",
        blockStackTight: "block-stack-tight",
        switchRow: "switch-row",
        sectionMarginTop: "section-margin-top",
        languageRow: "language-row",
    },
}));

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 2000,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const defaultState = {
    config: {
        table_watermark_enabled: true,
        workspace_style: "classic",
        show_add_torrent_dialog: true,
        show_torrent_server_setup: true,
    },
    fieldStates: {},
};

const defaultActions = {
    onApplySetting: vi.fn(),
    buttonActions: {
        restoreHud: vi.fn(),
    },
    interfaceTab: {
        hasDismissedInsights: false,
    },
};

const renderContent = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(React.createElement(InterfaceTabContent));
    return {
        container,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("InterfaceTabContent", () => {
    beforeEach(() => {
        useSettingsFormStateMock.mockReturnValue(defaultState);
        useSettingsFormActionsMock.mockReturnValue(defaultActions);
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
    });

    it("routes ordinary interface controls through the generic apply command", async () => {
        const onApplySetting = vi.fn();
        useSettingsFormActionsMock.mockReturnValue({
            ...defaultActions,
            onApplySetting,
        });
        const mounted = renderContent();
        try {
            await waitForCondition(
                () => mounted.container.querySelectorAll("button").length >= 2,
            );
            const buttons =
                mounted.container.querySelectorAll<HTMLButtonElement>("button");
            const classicButton = buttons[0];
            const immersiveButton = buttons[1];
            const switches = mounted.container.querySelectorAll<HTMLInputElement>(
                'input[type="checkbox"]',
            );
            const [tableWatermarkSwitch, showAddDialogSwitch, showServerSetupSwitch] =
                switches;

            immersiveButton.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            tableWatermarkSwitch.click();
            showAddDialogSwitch.click();
            showServerSetupSwitch.click();
            classicButton.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );

            expect(onApplySetting).toHaveBeenCalledWith(
                "workspace_style",
                "immersive",
            );
            expect(onApplySetting).toHaveBeenCalledWith(
                "table_watermark_enabled",
                false,
            );
            expect(onApplySetting).toHaveBeenCalledWith(
                "show_add_torrent_dialog",
                false,
            );
            expect(onApplySetting).toHaveBeenCalledWith(
                "show_torrent_server_setup",
                false,
            );
            expect(onApplySetting).not.toHaveBeenCalledWith(
                "workspace_style",
                "classic",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("renders local feedback and disables controls while fields are pending", async () => {
        useSettingsFormStateMock.mockReturnValue({
            ...defaultState,
            config: {
                ...defaultState.config,
                workspace_style: "immersive",
            },
            fieldStates: {
                workspace_style: {
                    pending: true,
                    error: {
                        kind: "apply",
                        text: "workspace failed",
                    },
                },
                table_watermark_enabled: {
                    pending: true,
                    error: {
                        kind: "apply",
                        text: "watermark failed",
                    },
                },
            },
        });

        const mounted = renderContent();
        try {
            await waitForCondition(
                () =>
                    mounted.container.textContent?.includes("workspace failed") ??
                    false,
            );
            const buttons =
                mounted.container.querySelectorAll<HTMLButtonElement>("button");
            const classicButton = buttons[0];
            const immersiveButton = buttons[1];
            const tableWatermarkSwitch =
                mounted.container.querySelector<HTMLInputElement>(
                'input[type="checkbox"]',
                );

            expect(mounted.container.textContent).toContain("workspace failed");
            expect(mounted.container.textContent).toContain("watermark failed");
            expect(classicButton.disabled).toBe(true);
            expect(immersiveButton.disabled).toBe(true);
            expect(tableWatermarkSwitch?.disabled).toBe(true);
        } finally {
            mounted.cleanup();
        }
    });
});
