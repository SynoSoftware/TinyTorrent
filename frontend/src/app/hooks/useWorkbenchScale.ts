import { usePreferences } from "@/app/context/PreferencesContext";

export default function useWorkbenchScale() {
    const {
        preferences: { workbenchScale },
        setWorkbenchScale,
        increaseWorkbenchScale,
        decreaseWorkbenchScale,
        resetWorkbenchScale,
    } = usePreferences();

    return {
        scale: workbenchScale,
        setScale: setWorkbenchScale,
        increase: increaseWorkbenchScale,
        decrease: decreaseWorkbenchScale,
        reset: resetWorkbenchScale,
    } as const;
}
