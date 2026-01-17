import { useSession } from "@/app/context/SessionContext";
import type { UiCapabilities, UiMode } from "@/app/utils/uiMode";

export { type UiMode, type UiCapabilities };

export function useUiModeCapabilities(): UiCapabilities {
    const { uiCapabilities } = useSession();
    return uiCapabilities;
}
