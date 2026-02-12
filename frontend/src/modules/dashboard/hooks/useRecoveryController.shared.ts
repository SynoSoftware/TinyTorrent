import { scheduler } from "@/app/services/scheduler";
import { STATUS } from "@/shared/status";
import {
    getClassificationOverride,
    setClassificationOverride,
} from "@/services/recovery/missingFilesStore";

export const isRecoveryActiveState = (state?: string) => {
    if (!state) return false;
    const normalized = state.toLowerCase();
    return (
        normalized === STATUS.torrent.DOWNLOADING ||
        normalized === STATUS.torrent.SEEDING ||
        normalized === STATUS.torrent.QUEUED
    );
};

export const clearClassificationOverrideIfPresent = (id?: string | number) => {
    if (id === undefined || id === null) return;
    if (getClassificationOverride(id) === undefined) return;
    setClassificationOverride(id, undefined);
};

export const delay = (ms: number) =>
    new Promise<void>((resolve) => {
        scheduler.scheduleTimeout(resolve, ms);
    });
