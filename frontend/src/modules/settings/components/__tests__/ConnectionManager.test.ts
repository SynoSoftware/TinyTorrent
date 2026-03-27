import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ConnectionCredentialsCard } from "@/modules/settings/components/tabs/connection/ConnectionManager";

const useConnectionConfigMock = vi.hoisted(() => vi.fn());
const useSessionMock = vi.hoisted(() => vi.fn());

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
        isLoading,
        startContent,
        ...props
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
        isDisabled?: boolean;
        isLoading?: boolean;
        startContent?: React.ReactNode;
        [key: string]: unknown;
    }) =>
        React.createElement(
            "button",
            {
                ...props,
                type: "button",
                disabled: Boolean(isDisabled ?? isLoading),
                onClick: onPress,
            },
            startContent,
            children,
        ),
    Chip: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
    Input: ({
        value,
        onChange,
        isDisabled,
        ...props
    }: {
        value?: string;
        onChange?: (event: { target: { value: string } }) => void;
        isDisabled?: boolean;
        [key: string]: unknown;
    }) =>
        React.createElement("input", {
            ...props,
            value,
            disabled: Boolean(isDisabled),
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                onChange?.({ target: { value: event.target.value } }),
        }),
}));

vi.mock("@/app/context/ConnectionConfigContext", () => ({
    useConnectionConfig: useConnectionConfigMock,
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: useSessionMock,
}));

type ConnectionProfileFixture = {
    id: string;
    label: string;
    scheme: "http" | "https";
    host: string;
    port: string;
    username: string;
    password: string;
};

let activeProfile: ConnectionProfileFixture;
let updateProfileMock: ReturnType<typeof vi.fn>;
let primeNextProbeMock: ReturnType<typeof vi.fn>;

const renderCard = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const rerender = () => {
        act(() => {
            flushSync(() => {
                root.render(React.createElement(ConnectionCredentialsCard));
            });
        });
    };

    rerender();

    return {
        container,
        rerender,
        cleanup: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
        },
    };
};

describe("ConnectionCredentialsCard", () => {
    beforeEach(() => {
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: true,
        });
        activeProfile = {
            id: "profile-1",
            label: "",
            scheme: "http",
            host: "server-one.local",
            port: "9091",
            username: "",
            password: "",
        };

        updateProfileMock = vi.fn();
        primeNextProbeMock = vi.fn();

        useConnectionConfigMock.mockImplementation(() => ({
            activeProfile,
            activeRpcConnection: {
                serverUrl: `http://${activeProfile.host}:${activeProfile.port}`,
            },
            updateProfile: updateProfileMock,
        }));

        useSessionMock.mockReturnValue({
            primeNextProbe: primeNextProbeMock,
            reconnect: vi.fn(),
            rpcStatus: "idle",
            uiCapabilities: {
                isLoopback: false,
                uiMode: "Full",
            },
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: false,
        });
    });

    it("drops a stale draft override when the active profile changes", () => {
        const mounted = renderCard();
        try {
            const hostInput =
                mounted.container.querySelector<HTMLInputElement>(
                    'input[aria-label="settings.connection.host"]',
                );
            if (!hostInput) {
                throw new Error("host_input_missing");
            }

            hostInput.value = "edited-host.local";
            hostInput.dispatchEvent(new Event("input", { bubbles: true }));
            hostInput.dispatchEvent(new Event("change", { bubbles: true }));
            expect(hostInput.value).toBe("edited-host.local");

            activeProfile = {
                ...activeProfile,
                id: "profile-2",
                host: "server-two.local",
            };

            mounted.rerender();

            const rerenderedHostInput =
                mounted.container.querySelector<HTMLInputElement>(
                    'input[aria-label="settings.connection.host"]',
                );
            expect(rerenderedHostInput?.value).toBe("server-two.local");
        } finally {
            mounted.cleanup();
        }
    });

    it("primes local connect without showing the startup dialog", () => {
        const mounted = renderCard();
        try {
            const connectLocalButton = Array.from(
                mounted.container.querySelectorAll("button"),
            ).find(
                (button) =>
                    button.textContent?.trim() ===
                    "settings.connection.connect_to_this_pc",
            );
            if (!connectLocalButton) {
                throw new Error("connect_local_button_missing");
            }

            act(() => {
                connectLocalButton.click();
            });

            expect(primeNextProbeMock).toHaveBeenCalledWith("reconnect", {
                suppressTimeoutDialog: true,
                disableRetry: true,
            });
            expect(updateProfileMock).toHaveBeenCalledWith(
                activeProfile.id,
                expect.objectContaining({
                    host: "localhost",
                }),
            );
        } finally {
            mounted.cleanup();
        }
    });
});
