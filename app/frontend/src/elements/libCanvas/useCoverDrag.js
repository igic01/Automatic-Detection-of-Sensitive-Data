import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    buildHandlePositions,
    buildOverlayBox,
    clamp,
    computeMetrics,
    pointToImageSpace,
} from "./cropMath";
import { calculateHandleRect, calculateMoveRect } from "./cropDrag";

export function useCoverDrag({
    containerRef,
    imageRef,
    scale,
    offset,
    metrics,
    coverRects = [],
    coverOrigin = { x: 0, y: 0 },
    coversEnabled = false,
    appliedCropRect = null,
    isCropping = false,
    onUpdateCoverRect,
    onBeginCoverChange,
    onEndCoverChange,
}) {
    const [activeCoverIdState, setActiveCoverIdState] = useState(null);
    const [isDraggingCover, setIsDraggingCover] = useState(false);
    const coverDragRef = useRef(null);

    const coverBoxes = useMemo(() => {
        if (!coversEnabled || !metrics || !Array.isArray(coverRects) || !coverRects.length) {
            return [];
        }
        const origin = coverOrigin || { x: 0, y: 0 };
        return coverRects
            .map((rect) => {
                const overlay = buildOverlayBox(
                    { ...rect, x: rect.x + origin.x, y: rect.y + origin.y },
                    metrics,
                    scale
                );
                if (!overlay) return null;
                return {
                    ...rect,
                    overlay,
                    handlePositions: buildHandlePositions(overlay),
                };
            })
            .filter(Boolean);
    }, [coversEnabled, coverOrigin, coverRects, metrics, scale]);

    useEffect(() => {
        if (!coversEnabled && coverDragRef.current) {
            coverDragRef.current = null;
            onEndCoverChange?.();
        }
    }, [coversEnabled, onEndCoverChange]);

    const toCoverPoint = useCallback(
        (clientX, clientY) => {
            const baseMetrics = metrics ?? computeMetrics({ containerRef, imageRef, scale, offset });
            if (!baseMetrics) return null;
            const point = pointToImageSpace(clientX, clientY, baseMetrics, scale);
            if (!point) return null;
            const origin = coverOrigin || { x: 0, y: 0 };
            const useCropBounds =
                appliedCropRect &&
                coverOrigin &&
                appliedCropRect.x === coverOrigin.x &&
                appliedCropRect.y === coverOrigin.y;
            const maxX = Math.max(
                0,
                useCropBounds ? appliedCropRect.width : (baseMetrics.naturalWidth || 0) - origin.x
            );
            const maxY = Math.max(
                0,
                useCropBounds ? appliedCropRect.height : (baseMetrics.naturalHeight || 0) - origin.y
            );
            const x = clamp(point.x - origin.x, 0, maxX);
            const y = clamp(point.y - origin.y, 0, maxY);
            return { x, y, bounds: { naturalWidth: maxX, naturalHeight: maxY } };
        },
        [appliedCropRect, coverOrigin, containerRef, imageRef, metrics, offset, scale]
    );

    const beginCoverHandleDrag = useCallback(
        (handle, rect, event) => {
            if (!rect || isCropping || !coversEnabled) return;
            const point = toCoverPoint(event.clientX, event.clientY);
            if (!point) return;
            event.preventDefault();
            event.stopPropagation();
            onBeginCoverChange?.();
            setActiveCoverIdState(rect.id || null);
            coverDragRef.current = {
                type: "handle",
                handle,
                startRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                startPoint: point,
                aspect: rect.width && rect.height ? rect.width / rect.height : 1,
                id: rect.id,
            };
            setIsDraggingCover(true);
        },
        [coversEnabled, isCropping, onBeginCoverChange, toCoverPoint]
    );

    const beginCoverMoveDrag = useCallback(
        (rect, event) => {
            if (!rect || isCropping || !coversEnabled) return;
            if (event.button !== 0) return;
            const point = toCoverPoint(event.clientX, event.clientY);
            if (!point) return;
            event.preventDefault();
            event.stopPropagation();
            onBeginCoverChange?.();
            setActiveCoverIdState(rect.id || null);
            coverDragRef.current = {
                type: "move",
                startRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                startPoint: point,
                id: rect.id,
            };
            setIsDraggingCover(true);
        },
        [coversEnabled, isCropping, onBeginCoverChange, toCoverPoint]
    );

    useEffect(() => {
        const handleMoveEvent = (e) => {
            if (!coverDragRef.current) return;
            const point = toCoverPoint(e.clientX, e.clientY);
            if (!point) return;
            let next = null;
            if (coverDragRef.current.type === "handle") {
                next = calculateHandleRect({
                    handle: coverDragRef.current.handle,
                    startRect: coverDragRef.current.startRect,
                    point,
                    aspect: coverDragRef.current.aspect,
                    keepAspect: e.shiftKey,
                });
            } else if (coverDragRef.current.type === "move") {
                next = calculateMoveRect({
                    startRect: coverDragRef.current.startRect,
                    startPoint: coverDragRef.current.startPoint,
                    point,
                });
            }
            if (next && typeof onUpdateCoverRect === "function") {
                onUpdateCoverRect(coverDragRef.current.id, next);
            }
        };

        const handleUpEvent = () => {
            if (!coverDragRef.current) return;
            coverDragRef.current = null;
            setIsDraggingCover(false);
            onEndCoverChange?.();
        };

        window.addEventListener("mousemove", handleMoveEvent);
        window.addEventListener("mouseup", handleUpEvent);

        return () => {
            window.removeEventListener("mousemove", handleMoveEvent);
            window.removeEventListener("mouseup", handleUpEvent);
        };
    }, [onEndCoverChange, onUpdateCoverRect, toCoverPoint]);

    const clearActiveCover = useCallback(() => setActiveCoverIdState(null), []);

    const activeCoverId = useMemo(() => {
        if (!coversEnabled || !activeCoverIdState) return null;
        const stillExists = (coverRects ?? []).some((rect) => rect.id === activeCoverIdState);
        return stillExists ? activeCoverIdState : null;
    }, [activeCoverIdState, coverRects, coversEnabled]);

    const isDraggingCoverActive = coversEnabled && isDraggingCover;

    return {
        activeCoverId,
        isDraggingCover: isDraggingCoverActive,
        coverBoxes,
        beginCoverHandleDrag,
        beginCoverMoveDrag,
        clearActiveCover,
    };
}
