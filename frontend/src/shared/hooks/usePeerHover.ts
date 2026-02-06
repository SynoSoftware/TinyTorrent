import { useCallback, useState } from "react";

interface UsePeerHoverResult {
    hoveredPeer: string | null;
    setHoveredPeer: (value: string | null) => void;
    clearHoveredPeer: () => void;
}

export const usePeerHover = (): UsePeerHoverResult => {
    const [hoveredPeer, setHoveredPeerState] = useState<string | null>(null);

    const setHoveredPeer = useCallback((value: string | null) => {
        setHoveredPeerState(value);
    }, []);

    const clearHoveredPeer = useCallback(() => {
        setHoveredPeerState(null);
    }, []);

    return { hoveredPeer, setHoveredPeer, clearHoveredPeer };
};
