import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    buildHandlePositions,
    buildOverlayBox,
    computeMetrics,
    createDefaultRect,
    metricsEqual,
    pointToImageSpace,
} from "./cropMath";
import { calculateHandleRect, calculateMoveRect } from "./cropDrag";

export function useCrop({
    containerRef,
    imageRef,
    scale,
    offset,
    imageSrc,
    onStateChange,
    getCovers,
}) {
    const emptyCropState = useMemo(
        () => ({
            isCropping: false,
            cropRect: null,
            appliedCropRect: null,
            isDraggingCrop: false,
        }),
        []
    );
    const [cropState, setCropState] = useState(() => ({
        imageSrc,
        ...emptyCropState,
    }));
    const [metrics, setMetrics] = useState(null);
    const dragRef = useRef(null);

    const resolvedCropState = useMemo(
        () => (cropState.imageSrc === imageSrc ? cropState : { imageSrc, ...emptyCropState }),
        [cropState, emptyCropState, imageSrc]
    );

    const { isCropping, cropRect, appliedCropRect, isDraggingCrop } = resolvedCropState;

    const setCropStateForImage = useCallback(
        (updater) => {
            setCropState((prev) => {
                const base =
                    prev.imageSrc === imageSrc ? prev : { imageSrc, ...emptyCropState };
                const nextPartial = typeof updater === "function" ? updater(base) : updater;
                return { ...base, ...nextPartial, imageSrc };
            });
        },
        [emptyCropState, imageSrc]
    );

    const setCropRect = useCallback(
        (next) => {
            setCropStateForImage((prev) => ({
                cropRect: typeof next === "function" ? next(prev.cropRect) : next,
            }));
        },
        [setCropStateForImage]
    );

    const setIsDraggingCrop = useCallback(
        (next) => {
            setCropStateForImage({ isDraggingCrop: next });
        },
        [setCropStateForImage]
    );

    const syncMetrics = useCallback(() => {
        setMetrics((prev) => {
            const next = (() => {
                try {
                    return computeMetrics({ containerRef, imageRef, scale, offset });
                } catch (error) {
                    console.error("Failed to read crop metrics", error);
                    return null;
                }
            })();

            return metricsEqual(prev, next) ? prev : next;
        });
    }, [containerRef, imageRef, offset, scale]);

    useLayoutEffect(() => {
        syncMetrics();
    }, [syncMetrics]);

    useEffect(() => {
        const handleResize = () => syncMetrics();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [syncMetrics]);

    useEffect(() => {
        const image = imageRef?.current;
        if (!image) return undefined;

        const handleLoad = () => syncMetrics();
        if (image.complete && image.naturalWidth) {
            syncMetrics();
        }

        image.addEventListener("load", handleLoad);
        return () => image.removeEventListener("load", handleLoad);
    }, [imageRef, imageSrc, syncMetrics]);

    const overlayBox = useMemo(
        () => buildOverlayBox(cropRect, metrics, scale),
        [cropRect, metrics, scale]
    );

    const appliedOverlayBox = useMemo(
        () => buildOverlayBox(appliedCropRect, metrics, scale),
        [appliedCropRect, metrics, scale]
    );

    const handlePositions = useMemo(
        () => buildHandlePositions(overlayBox),
        [overlayBox]
    );

    const setCropActive = useCallback(
        (next) => {
            const nextValue = typeof next === "function" ? next(isCropping) : next;
            setCropStateForImage({ isCropping: nextValue });
            onStateChange?.(nextValue);
        },
        [isCropping, onStateChange, setCropStateForImage]
    );

    const startCrop = useCallback(() => {
        if (!imageSrc) return;
        syncMetrics();
        const metricsSnapshot = metrics ?? computeMetrics({ containerRef, imageRef, scale, offset });
        setCropRect((prev) => prev ?? appliedCropRect ?? createDefaultRect(metricsSnapshot, 0));
        setCropActive(true);
    }, [
        appliedCropRect,
        containerRef,
        imageRef,
        imageSrc,
        metrics,
        offset,
        scale,
        setCropActive,
        setCropRect,
        syncMetrics,
    ]);

    const getCroppedBlob = useCallback(async () => {
        const targetRect = appliedCropRect || cropRect;
        if (!targetRect || !imageSrc) return null;
        const imageEl = imageRef.current;
        if (!imageEl) return null;

        const width = Math.max(1, Math.round(targetRect.width));
        const height = Math.max(1, Math.round(targetRect.height));
        const sx = Math.max(0, Math.round(targetRect.x));
        const sy = Math.max(0, Math.round(targetRect.y));

        const createCanvas = () => {
            if (typeof OffscreenCanvas !== "undefined") {
                return new OffscreenCanvas(width, height);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            return canvas;
        };

        try {
            let bitmap = null;
            if (typeof createImageBitmap === "function") {
                bitmap = await createImageBitmap(imageEl, sx, sy, width, height);
            }

            const canvas = createCanvas();
            const ctx = canvas.getContext("2d");
            if (!ctx) return false;

            if (bitmap) {
                ctx.drawImage(bitmap, 0, 0, width, height);
                bitmap.close?.();
            } else {
                ctx.drawImage(imageEl, -sx, -sy);
            }

            const coversPayload = typeof getCovers === "function" ? getCovers() : [];
            const covers = Array.isArray(coversPayload) ? coversPayload : coversPayload?.covers || [];
            const origin = Array.isArray(coversPayload) ? { x: 0, y: 0 } : coversPayload?.origin || { x: 0, y: 0 };
            if (covers?.length) {
                covers.forEach((cover) => {
                    const absX = (cover?.x || 0) + (origin?.x || 0);
                    const absY = (cover?.y || 0) + (origin?.y || 0);
                    const cx = absX - sx;
                    const cy = absY - sy;
                    if (cx + cover.width <= 0 || cy + cover.height <= 0 || cx >= width || cy >= height) {
                        return;
                    }
                    ctx.fillStyle = cover.color || "#000";
                    ctx.fillRect(cx, cy, cover.width, cover.height);
                });
            }

            const blob =
                typeof canvas.convertToBlob === "function"
                    ? await canvas.convertToBlob({ type: "image/png" })
                    : await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

            if (!blob) return null;
            return {
                blob,
                name: "cropped-image.png",
            };
        } catch (error) {
            console.error("Failed to apply crop", error);
            return null;
        }
    }, [appliedCropRect, cropRect, imageRef, imageSrc, getCovers]);

    const finishCrop = useCallback(() => {
        if (!isCropping || !cropRect) {
            setCropStateForImage({
                isCropping: false,
                cropRect: null,
                isDraggingCrop: false,
            });
            onStateChange?.(false);
            return false;
        }
        setCropStateForImage({
            appliedCropRect: cropRect,
            isCropping: false,
            cropRect: null,
            isDraggingCrop: false,
        });
        onStateChange?.(false);
        return true;
    }, [cropRect, isCropping, onStateChange, setCropStateForImage]);

    const setAppliedCropRectExternal = useCallback(
        (rect) => {
            setCropStateForImage({
                appliedCropRect: rect ? { ...rect } : null,
                cropRect: null,
                isCropping: false,
                isDraggingCrop: false,
            });
            onStateChange?.(false);
        },
        [onStateChange, setCropStateForImage]
    );

    const toggleCrop = useCallback(() => {
        if (isCropping) {
            finishCrop();
        } else {
            startCrop();
        }
    }, [finishCrop, isCropping, startCrop]);

    const toImagePoint = useCallback(
        (clientX, clientY) => {
            const nextMetrics = metrics ?? computeMetrics({ containerRef, imageRef, scale, offset });
            return pointToImageSpace(clientX, clientY, nextMetrics, scale);
        },
        [containerRef, imageRef, metrics, offset, scale]
    );

    const beginHandleDrag = useCallback(
        (handle, event) => {
            if (!cropRect) return;
            const point = toImagePoint(event.clientX, event.clientY);
            if (!point) return;
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = {
                type: "handle",
                handle,
                startRect: cropRect,
                startPoint: point,
                aspect: cropRect.width && cropRect.height ? cropRect.width / cropRect.height : 1,
            };
            setIsDraggingCrop(true);
        },
        [cropRect, setIsDraggingCrop, toImagePoint]
    );

    const beginMoveDrag = useCallback(
        (event) => {
            if (!cropRect) return;
            const point = toImagePoint(event.clientX, event.clientY);
            if (!point) return;
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = {
                type: "move",
                startRect: cropRect,
                startPoint: point,
            };
            setIsDraggingCrop(true);
        },
        [cropRect, setIsDraggingCrop, toImagePoint]
    );

    useEffect(() => {
        const handleMoveEvent = (e) => {
            if (!dragRef.current) return;
            const point = toImagePoint(e.clientX, e.clientY);
            if (!point) return;

            if (dragRef.current.type === "move") {
                const next = calculateMoveRect({
                    startRect: dragRef.current.startRect,
                    startPoint: dragRef.current.startPoint,
                    point,
                });
                if (next) setCropRect(next);
            } else if (dragRef.current.type === "handle") {
                const next = calculateHandleRect({
                    handle: dragRef.current.handle,
                    startRect: dragRef.current.startRect,
                    point,
                    aspect: dragRef.current.aspect,
                    keepAspect: e.shiftKey,
                });
                if (next) setCropRect(next);
            }
        };

        const handleUpEvent = () => {
            if (!dragRef.current) return;
            dragRef.current = null;
            setIsDraggingCrop(false);
        };

        window.addEventListener("mousemove", handleMoveEvent);
        window.addEventListener("mouseup", handleUpEvent);

        return () => {
            window.removeEventListener("mousemove", handleMoveEvent);
            window.removeEventListener("mouseup", handleUpEvent);
        };
    }, [setCropRect, setIsDraggingCrop, toImagePoint]);

    useEffect(() => {
        if (cropState.imageSrc === imageSrc) return;
        dragRef.current = null;
        if (cropState.isCropping) {
            onStateChange?.(false);
        }
    }, [cropState.imageSrc, cropState.isCropping, imageSrc, onStateChange]);

    const appliedClipStyle = useMemo(() => {
        if (!appliedCropRect || !metrics?.naturalWidth || !metrics?.naturalHeight) return null;
        const { naturalWidth, naturalHeight } = metrics;
        const top = (appliedCropRect.y / naturalHeight) * 100;
        const left = (appliedCropRect.x / naturalWidth) * 100;
        const bottom = ((naturalHeight - appliedCropRect.y - appliedCropRect.height) / naturalHeight) * 100;
        const right = ((naturalWidth - appliedCropRect.x - appliedCropRect.width) / naturalWidth) * 100;
        const clip = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
        return { clipPath: clip, WebkitClipPath: clip };
    }, [appliedCropRect, metrics]);

    return {
        isCropping,
        cropRect,
        appliedCropRect,
        appliedOverlayBox,
        appliedClipStyle,
        metrics,
        hasAppliedCrop: !!appliedCropRect,
        overlayBox,
        handlePositions,
        isDraggingCrop,
        startCrop,
        finishCrop,
        toggleCrop,
        beginHandleDrag,
        beginMoveDrag,
        getCroppedBlob,
        setAppliedCropRect: setAppliedCropRectExternal,
    };
}
