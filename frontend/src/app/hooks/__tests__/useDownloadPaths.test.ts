import { beforeEach, describe, expect, it } from "vitest";

const ensureStorage = () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => {
                store.set(key, value);
            },
            removeItem: (key: string) => {
                store.delete(key);
            },
            clear: () => {
                store.clear();
            },
        },
        configurable: true,
    });
};

const loadHookModule = async () => {
    ensureStorage();
    return import("@/app/hooks/useDownloadPaths");
};

describe("mergeDownloadPaths", () => {
    beforeEach(() => {
        ensureStorage();
        window.localStorage.clear();
    });

    it("moves duplicate paths to the front instead of keeping duplicates", async () => {
        const { mergeDownloadPaths } = await loadHookModule();
        const next = mergeDownloadPaths(
            ["C:\\Downloads\\Two", "C:\\Downloads\\One"],
            "C:\\Downloads\\One",
        );

        expect(next).toEqual([
            "C:\\Downloads\\One",
            "C:\\Downloads\\Two",
        ]);
    });

    it("treats trailing separators as the same history entry", async () => {
        const { mergeDownloadPaths } = await loadHookModule();
        const next = mergeDownloadPaths(
            ["C:\\Temp\\A", "C:\\Temp\\"],
            "C:\\Temp",
        );

        expect(next).toEqual(["C:\\Temp", "C:\\Temp\\A"]);
    });

    it("caps the history at the configured length", async () => {
        const { maxDownloadPaths, mergeDownloadPaths } = await loadHookModule();
        const next = mergeDownloadPaths(
            [
                "C:\\Downloads\\6",
                "C:\\Downloads\\5",
                "C:\\Downloads\\4",
                "C:\\Downloads\\3",
                "C:\\Downloads\\2",
                "C:\\Downloads\\1",
            ],
            "C:\\Downloads\\7",
        );

        expect(next).toHaveLength(maxDownloadPaths);
        expect(next).toEqual([
            "C:\\Downloads\\7",
            "C:\\Downloads\\6",
            "C:\\Downloads\\5",
            "C:\\Downloads\\4",
            "C:\\Downloads\\3",
            "C:\\Downloads\\2",
        ]);
    });

    it("ignores blank paths", async () => {
        const { mergeDownloadPaths } = await loadHookModule();
        const history = ["C:\\Downloads\\One", "C:\\Downloads\\Two"];

        expect(mergeDownloadPaths(history, "   ")).toEqual(history);
    });
});
