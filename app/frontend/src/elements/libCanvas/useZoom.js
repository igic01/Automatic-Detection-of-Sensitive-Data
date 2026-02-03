import { useEffect, useState } from "react";

export function useZoom(containerRef, {
    minScale = 0.1,
    maxScale = 5,
    intensity = 0.0003
} = {}) {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;

        const handleWheel = (e) => {
            e.preventDefault();
            const delta = -e.deltaY * intensity;
            setScale((prev) => {
                const next = prev + delta;
                return Math.min(Math.max(next, minScale), maxScale);
            });
        };

        node.addEventListener("wheel", handleWheel, { passive: false });
        return () => node.removeEventListener("wheel", handleWheel);
    }, [containerRef, intensity, minScale, maxScale]);

    return { scale, setScale };
}
