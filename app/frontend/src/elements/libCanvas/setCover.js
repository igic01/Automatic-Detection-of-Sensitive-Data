import { useCallback, useEffect, useMemo, useState } from "react";
import { buildOverlayBox, clamp, computeMetrics, metricsEqual } from "./cropMath";

/**
 * Manages "cover" rectangles drawn over the image and provides helpers
 * to render and bake them into exported images.
 */
export function useCover({ containerRef, imageRef, scale, offset, imageSrc }) {
    const [coverState, setCoverState] = useState(() => ({
        imageSrc,
        covers: [],
    }));
    const [metrics, setMetrics] = useState(null);
    const covers = useMemo(
        () => (coverState.imageSrc === imageSrc ? coverState.covers : []),
        [coverState.covers, coverState.imageSrc, imageSrc]
    );

    const setCovers = useCallback(
        (updater) => {
            setCoverState((prev) => {
                const base = prev.imageSrc === imageSrc ? prev.covers : [];
                const next = typeof updater === "function" ? updater(base) : updater;
                return { imageSrc, covers: next };
            });
        },
        [imageSrc]
    );

    const syncMetrics = useCallback(() => {
        setMetrics((prev) => {
            const next = (() => {
                try {
                    return computeMetrics({ containerRef, imageRef, scale, offset });
                } catch (error) {
                    console.error("Failed to read cover metrics", error);
                    return null;
                }
            })();
            return metricsEqual(prev, next) ? prev : next;
        });
    }, [containerRef, imageRef, offset, scale]);

    useEffect(() => {
        const handleResize = () => syncMetrics();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [syncMetrics]);

    useEffect(() => {
        syncMetrics();
    }, [offset, scale, syncMetrics]);

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

    const addCover = useCallback(() => {
        const image = imageRef?.current;
        if (!image) return;
        const naturalWidth = image.naturalWidth || 0;
        const naturalHeight = image.naturalHeight || 0;
        if (!naturalWidth || !naturalHeight) return;

        const size = Math.min(50, naturalWidth, naturalHeight);
        const x = clamp(20, 0, naturalWidth - size);
        const y = clamp(10, 0, naturalHeight - size);

        setCovers((prev) => [
            ...prev,
            {
                id: `cover-${Date.now()}-${prev.length}`,
                x,
                y,
                width: size,
                height: size,
            },
        ]);
    }, [imageRef, setCovers]);

    const coverBoxes = useMemo(
        () =>
            covers
                .map((cover) => {
                    const box = buildOverlayBox(cover, metrics, scale);
                    if (!box) return null;
                    return { ...box, id: cover.id };
                })
                .filter(Boolean),
        [covers, metrics, scale]
    );

    const applyCoversToCanvas = useCallback(
        (ctx, targetRect) => {
            if (!ctx || !covers.length) return;
            const rect = targetRect || { x: 0, y: 0 };
            const baseX = rect.x || 0;
            const baseY = rect.y || 0;

            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.95)";

            covers.forEach((cover) => {
                const x = cover.x - baseX;
                const y = cover.y - baseY;
                const w = cover.width;
                const h = cover.height;
                const ix = Math.max(0, x);
                const iy = Math.max(0, y);
                const iw = Math.min(w - (ix - x), (rect.width || w) - ix);
                const ih = Math.min(h - (iy - y), (rect.height || h) - iy);
                if (iw > 0 && ih > 0) {
                    ctx.fillRect(ix, iy, iw, ih);
                }
            });

            ctx.restore();
        },
        [covers]
    );

    return {
        covers,
        metrics,
        coverBoxes,
        addCover,
        applyCoversToCanvas,
    };
}
