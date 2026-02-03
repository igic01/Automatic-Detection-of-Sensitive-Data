export const MIN_SIZE = 12;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const metricsEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
        a.naturalWidth === b.naturalWidth &&
        a.naturalHeight === b.naturalHeight &&
        a.boxWidth === b.boxWidth &&
        a.boxHeight === b.boxHeight &&
        a.left === b.left &&
        a.top === b.top &&
        a.relativeLeft === b.relativeLeft &&
        a.relativeTop === b.relativeTop
    );
};

export const computeMetrics = ({ containerRef, imageRef, scale, offset }) => {
    const container = containerRef?.current;
    const image = imageRef?.current;
    if (!container || !image) return null;

    const { naturalWidth, naturalHeight } = image;
    if (!naturalWidth || !naturalHeight) return null;

    const containerRect = container.getBoundingClientRect();
    const boxWidth = naturalWidth * scale;
    const boxHeight = naturalHeight * scale;
    const relativeLeft = containerRect.width / 2 + offset.x - boxWidth / 2;
    const relativeTop = containerRect.height / 2 + offset.y - boxHeight / 2;

    return {
        naturalWidth,
        naturalHeight,
        containerRect,
        boxWidth,
        boxHeight,
        left: containerRect.left + relativeLeft,
        top: containerRect.top + relativeTop,
        relativeLeft,
        relativeTop,
    };
};

export const buildOverlayBox = (cropRect, metrics, scale) => {
    if (!cropRect || !metrics) return null;
    return {
        left: metrics.left + cropRect.x * scale,
        top: metrics.top + cropRect.y * scale,
        width: cropRect.width * scale,
        height: cropRect.height * scale,
        relativeLeft: metrics.relativeLeft + cropRect.x * scale,
        relativeTop: metrics.relativeTop + cropRect.y * scale,
    };
};

export const buildHandlePositions = (overlayBox) => {
    if (!overlayBox) return [];
    const { relativeLeft: left, relativeTop: top, width, height } = overlayBox;
    const cx = left + width / 2;
    const cy = top + height / 2;
    const right = left + width;
    const bottom = top + height;

    return [
        { id: "nw", x: left, y: top, cursor: "nwse-resize" },
        { id: "n", x: cx, y: top, cursor: "ns-resize" },
        { id: "ne", x: right, y: top, cursor: "nesw-resize" },
        { id: "e", x: right, y: cy, cursor: "ew-resize" },
        { id: "se", x: right, y: bottom, cursor: "nwse-resize" },
        { id: "s", x: cx, y: bottom, cursor: "ns-resize" },
        { id: "sw", x: left, y: bottom, cursor: "nesw-resize" },
        { id: "w", x: left, y: cy, cursor: "ew-resize" },
    ];
};

export const createDefaultRect = (metrics, padding = 0.1) => {
    if (!metrics) return null;
    const width = Math.max(MIN_SIZE, metrics.naturalWidth * (1 - padding * 2));
    const height = Math.max(MIN_SIZE, metrics.naturalHeight * (1 - padding * 2));
    return {
        x: clamp(metrics.naturalWidth * padding, 0, metrics.naturalWidth - width),
        y: clamp(metrics.naturalHeight * padding, 0, metrics.naturalHeight - height),
        width,
        height,
    };
};

export const pointToImageSpace = (clientX, clientY, metrics, scale) => {
    if (!metrics) return null;
    const x = (clientX - metrics.left) / scale;
    const y = (clientY - metrics.top) / scale;
    return {
        x: clamp(x, 0, metrics.naturalWidth),
        y: clamp(y, 0, metrics.naturalHeight),
        bounds: metrics,
    };
};
