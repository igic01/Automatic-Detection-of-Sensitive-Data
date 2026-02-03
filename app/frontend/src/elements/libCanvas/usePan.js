import { useRef, useState } from "react";

export function usePan(initialOffset = { x: 0, y: 0 }) {
    const [offset, setOffset] = useState(initialOffset);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef(null);

    const handleMouseDown = (e) => {
        dragStartRef.current = {
            x: e.clientX - offset.x,
            y: e.clientY - offset.y,
        };
        setIsDragging(true);
    };

    const handleMouseMove = (e) => {
        if (!dragStartRef.current) return;
        setOffset({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y,
        });
    };

    const endDrag = () => {
        dragStartRef.current = null;
        setIsDragging(false);
    };

    return {
        offset,
        isDragging,
        handleMouseDown,
        handleMouseMove,
        endDrag,
        setOffset,
    };
}
