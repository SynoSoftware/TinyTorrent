import { useSyncExternalStore } from "react";
import type {
    MissingFilesProbeResult,
    MissingFilesClassification,
} from "@/services/recovery/recovery-controller";

type Listener = () => void;

const probeCache = new Map<string | number, MissingFilesProbeResult>();
const listeners = new Set<Listener>();
const classificationOverrides = new Map<
    string | number,
    MissingFilesClassification
>();

export function getProbe(id?: string | number | null) {
    if (id === undefined || id === null) return undefined;
    return probeCache.get(id);
}

export function setProbe(
    id: string | number,
    result: MissingFilesProbeResult | undefined
) {
    if (result) {
        probeCache.set(id, result);
    } else {
        probeCache.delete(id);
    }
    listeners.forEach((listener) => listener());
}

export function clearProbe(id: string | number) {
    setProbe(id, undefined);
    classificationOverrides.delete(id);
}

export function setClassificationOverride(
    id: string | number,
    classification: MissingFilesClassification | undefined
) {
    if (classification) {
        classificationOverrides.set(id, classification);
    } else {
        classificationOverrides.delete(id);
    }
    listeners.forEach((listener) => listener());
}

export function getClassificationOverride(id?: string | number | null) {
    if (id === undefined || id === null) return undefined;
    return classificationOverrides.get(id);
}

export function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useMissingFilesProbe(id?: string | number | null) {
    const subscribeToStore = (listener: Listener) => subscribe(listener);
    const getSnapshot = () => getProbe(id);
    return useSyncExternalStore(subscribeToStore, getSnapshot, getSnapshot);
}
