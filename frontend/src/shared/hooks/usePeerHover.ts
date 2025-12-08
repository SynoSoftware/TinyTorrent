import { useState } from "react";

export const usePeerHover = () => {
    const [hoveredPeer, setHoveredPeer] = useState<string | null>(null);
    return { hoveredPeer, setHoveredPeer };
};
