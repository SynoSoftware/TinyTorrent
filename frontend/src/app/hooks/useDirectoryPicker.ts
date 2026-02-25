import { useCallback, useMemo } from "react";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import { shellAgent } from "@/app/agents/shell-agent";

export type DirectoryPickerProfile = "native_shell" | "manual_only";

export interface UseDirectoryPickerResult {
    profile: DirectoryPickerProfile;
    canPickDirectory: boolean;
    pickDirectory: (initialPath?: string) => Promise<string | null>;
}

export function useDirectoryPicker(): UseDirectoryPickerResult {
    const { canBrowse } = useUiModeCapabilities();
    const canPickDirectory = canBrowse;

    const profile = useMemo<DirectoryPickerProfile>(
        () => (canPickDirectory ? "native_shell" : "manual_only"),
        [canPickDirectory],
    );

    const pickDirectory = useCallback(
        async (initialPath?: string): Promise<string | null> => {
            if (!canPickDirectory) {
                return null;
            }
            const picked = await shellAgent.browseDirectory(initialPath);
            return picked ?? null;
        },
        [canPickDirectory],
    );

    return {
        profile,
        canPickDirectory,
        pickDirectory,
    };
}

