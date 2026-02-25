import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
    AppCommandProvider,
    useAppCommandContext,
    useRequiredTorrentActions,
    useTorrentCommands,
    type AppCommandContextValue,
} from "@/app/context/AppCommandContext";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";

const renderProbe = (element: React.ReactElement) => renderToString(element);

const APPLIED_OUTCOME: TorrentDispatchOutcome = {
    status: "applied",
};

const createCommandContextValue = (): AppCommandContextValue => {
    const dispatch: AppCommandContextValue["dispatch"] = async () =>
        APPLIED_OUTCOME;
    return {
        dispatch,
        commandApi: {
            handleTorrentAction: vi.fn().mockResolvedValue({
                status: "success",
            }),
            handleBulkAction: vi.fn().mockResolvedValue({
                status: "success",
            }),
            setDownloadLocation: vi.fn().mockResolvedValue({
                status: "success",
            }),
            openAddTorrentPicker: vi.fn().mockResolvedValue({
                status: "success",
            }),
            openAddMagnet: vi.fn().mockResolvedValue({
                status: "success",
            }),
        },
    };
};

describe("AppCommandContext", () => {
    it("throws when useAppCommandContext is used outside provider", () => {
        const Probe = () => {
            useAppCommandContext();
            return null;
        };

        expect(() => renderProbe(React.createElement(Probe))).toThrow(
            "useAppCommandContext must be used within AppCommandProvider"
        );
    });

    it("exposes dispatch through useRequiredTorrentActions", () => {
        const value = createCommandContextValue();

        const Probe = () => {
            const { dispatch } = useRequiredTorrentActions();
            return React.createElement(
                "span",
                null,
                String(dispatch === value.dispatch)
            );
        };

        const html = renderProbe(
            React.createElement(
                AppCommandProvider,
                { value, children: React.createElement(Probe) }
            )
        );

        expect(html).toContain("true");
    });

    it("exposes commandApi through useTorrentCommands", () => {
        const value = createCommandContextValue();

        const Probe = () => {
            const commandApi = useTorrentCommands();
            return React.createElement(
                "span",
                null,
                String(commandApi === value.commandApi)
            );
        };

        const html = renderProbe(
            React.createElement(
                AppCommandProvider,
                { value, children: React.createElement(Probe) }
            )
        );

        expect(html).toContain("true");
    });
});
