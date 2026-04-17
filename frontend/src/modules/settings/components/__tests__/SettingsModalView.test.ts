import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { SettingsModalView } from "@/modules/settings/components/SettingsModalView";

const modalSpy = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) =>
            values?.version ? `${key}:${String(values.version)}` : key,
    }),
}));

vi.mock("@heroui/react", () => ({
    Button: ({
        children,
        onPress,
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
    }) =>
        React.createElement(
            "button",
            { type: "button", onClick: onPress },
            children,
        ),
    Modal: Object.assign(
        ({
            children,
            ...props
        }: {
            children?: React.ReactNode;
            [key: string]: unknown;
        }) => {
            modalSpy({ type: "root", ...props });
            return React.createElement("div", null, children);
        },
        {
            Backdrop: ({
                children,
                ...props
            }: {
                children?: React.ReactNode;
                [key: string]: unknown;
            }) => {
                modalSpy({ type: "backdrop", ...props });
                return React.createElement("div", null, children);
            },
            Container: ({
                children,
                ...props
            }: {
                children?: React.ReactNode;
                [key: string]: unknown;
            }) => {
                modalSpy({ type: "container", ...props });
                return React.createElement("div", null, children);
            },
            Dialog: ({
                children,
                ...props
            }: {
                children?: React.ReactNode;
                [key: string]: unknown;
            }) => {
                modalSpy({ type: "dialog", ...props });
                return React.createElement("div", null, children);
            },
        },
    ),
    cn: (...values: Array<string | false | null | undefined>) =>
        values.filter(Boolean).join(" "),
}));

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    motion: {
        div: (props: {
            children?: React.ReactNode;
            layoutId?: string;
            [key: string]: unknown;
        }) => {
            const { children, ...restProps } = props;
            const domProps = { ...restProps };
            delete domProps.layoutId;
            return React.createElement("div", domProps, children);
        },
    },
}));

vi.mock("@/config/logic", () => ({
    registry: {
        tokens: {
            primitive: {
                motion: {
                    slow: "transition-slow",
                    medium: "transition-medium",
                },
            },
        },
        interaction: { config: { modalBloom: { variants: {}, transition: {} } } },
        visuals: {
            icon: { strokeWidth: 1 },
            interactive: {
                dismiss: "dismiss-style",
                navItem: "nav-item-style",
            },
            typography: {
                text: {
                    headingLarge: "heading-large",
                },
            },
        },
        visualizations: {
            surface: {
                fade: {
                    base: {
                        initial: { opacity: 0 },
                        animate: { opacity: 1 },
                        exit: { opacity: 0 },
                        transition: { duration: 0.2 },
                    },
                },
            },
        },
    },
}));

vi.mock("@/shared/version", () => ({
    APP_VERSION: "test-version",
}));

vi.mock("@/shared/ui/layout/glass-surface", () => ({
    form: {
        blockStackTight: "block-stack-tight",
    },
    modal: {
        placement: {
            center: "fixed inset-0 flex w-screen h-screen items-center justify-center",
        },
        surface: {
            base: "modal-base",
        },
        chrome: { header: "dialog-header", footer: "dialog-footer" },
        layout: { frame: "content-wrapper" },
    },
    surface: {
        chrome: {
            sticky: "sticky-header",
        },
    },
}));

vi.mock("@/shared/ui/layout/Section", () => ({
    Section: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
}));

vi.mock("@/shared/ui/layout/toolbar-button", () => ({
    ToolbarIconButton: ({
        ariaLabel,
        onPress,
    }: {
        ariaLabel: string;
        onPress: () => void;
    }) =>
        React.createElement("button", {
            type: "button",
            "aria-label": ariaLabel,
            onClick: onPress,
        }),
}));

vi.mock("@/shared/ui/layout/AlertPanel", () => ({
    AlertPanel: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
}));

vi.mock("@/modules/settings/context/SettingsFormContext", () => ({
    SettingsFormProvider: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
}));

vi.mock("@/modules/settings/components/SettingsFormBuilder", () => ({
    SettingsFormBuilder: () =>
        React.createElement("div", null, "settings-form-builder"),
}));

vi.mock("@/modules/settings/components/tabs/connection/ConnectionManager", () => ({
    ConnectionCredentialsCard: () =>
        React.createElement("div", null, "connection-credentials-card"),
}));

vi.mock("@/modules/settings/components/SettingsSection", () => ({
    SettingsSection: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
}));

vi.mock("@/modules/settings/components/tabs/system/SystemTabContent", () => ({
    SystemTabContent: () =>
        React.createElement("div", null, "system-tab-content"),
}));

vi.mock("@/modules/settings/components/InterfaceTabContent", () => ({
    InterfaceTabContent: () =>
        React.createElement("div", null, "interface-tab-content"),
}));

vi.mock("@/modules/settings/hooks/useSettingsModalController", () => ({
    useSettingsModalController: vi.fn(),
}));

type ModalPropsSnapshot = {
    isDismissable?: boolean;
};

type ModalContainerPropsSnapshot = {
    className?: string;
    scroll?: string;
    size?: string;
};

type SettingsModalController = React.ComponentProps<
    typeof SettingsModalView
>["controller"];

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

const latestModalProps = (): ModalPropsSnapshot => {
    const calls = modalSpy.mock.calls
        .map((call) => call[0] as { type?: string } & ModalPropsSnapshot)
        .filter((call) => call.type === "backdrop");
    if (calls.length === 0) {
        throw new Error("modal_not_rendered");
    }
    return calls[calls.length - 1];
};

const latestContainerProps = (): ModalContainerPropsSnapshot => {
    const calls = modalSpy.mock.calls
        .map((call) => call[0] as { type?: string } & ModalContainerPropsSnapshot)
        .filter((call) => call.type === "container");
    if (calls.length === 0) {
        throw new Error("modal_container_not_rendered");
    }
    return calls[calls.length - 1];
};

const createController = (): SettingsModalController =>
    ({
        modal: {
            isOpen: true,
            uiMode: "Full",
            settingsLoadError: false,
            modalError: null,
            isMobileMenuOpen: true,
            tabsFallbackActive: false,
            safeVisibleTabs: [
                {
                    id: "speed",
                    labelKey: "settings.tab.speed",
                    headerKey: "settings.header.speed",
                    icon: () => React.createElement("span", null, "icon"),
                    isCustom: false,
                    sections: [],
                },
            ],
            activeTabDefinition: {
                id: "speed",
                labelKey: "settings.tab.speed",
                headerKey: "settings.header.speed",
                icon: () => React.createElement("span", null, "icon"),
                isCustom: false,
                sections: [],
            },
            settingsFormState: {
                config: {},
                fieldStates: {},
                updateConfig: vi.fn(),
                setFieldDraft: vi.fn(),
                setFieldError: vi.fn(),
                revertFieldDraft: vi.fn(),
                jsonCopyStatus: "idle",
                configJson: "{}",
            },
            settingsFormActions: {
                capabilities: {
                    blocklistSupported: true,
                    versionGatedSettings: {
                        sequential_download: {
                            minimum: "4.1.0",
                            detectedVersion: "5.0.0",
                            state: "supported",
                        },
                        torrent_complete_verify_enabled: {
                            minimum: "4.1.0",
                            detectedVersion: "5.0.0",
                            state: "supported",
                        },
                    },
                },
                interfaceTab: {
                    hasDismissedInsights: false,
                },
                buttonActions: {
                    testPort: vi.fn(),
                    restoreHud: vi.fn(),
                },
                canBrowseDirectories: false,
                onApplySetting: vi.fn(),
                onBrowse: vi.fn(),
                onCopyConfigJson: vi.fn(),
            },
        },
        commands: {
            onOpenChange: vi.fn(),
            onRequestClose: vi.fn(),
            onOpenMobileMenu: vi.fn(),
            onSelectTab: vi.fn(),
            onReset: vi.fn(),
        },
    }) as unknown as SettingsModalController;

const renderView = (controller: SettingsModalController) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(SettingsModalView, {
            controller,
        }),
    );
    return {
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("SettingsModalView", () => {
    beforeEach(() => {
        modalSpy.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("does not allow overlay dismissal", async () => {
        const mounted = renderView(createController());
        try {
            await waitForCondition(() => modalSpy.mock.calls.length > 0);
            expect(latestModalProps().isDismissable).toBe(false);
            expect(latestContainerProps().className).toBe(
                "fixed inset-0 flex w-screen h-screen items-center justify-center",
            );
            expect(latestContainerProps().scroll).toBe("outside");
        } finally {
            mounted.cleanup();
        }
    });
});
