import { clamp, MIN_SIZE } from "./cropMath";

export const calculateMoveRect = ({ startRect, startPoint, point }) => {
    if (!startRect || !startPoint || !point) return null;
    const { naturalWidth, naturalHeight } = point.bounds;
    const deltaX = point.x - startPoint.x;
    const deltaY = point.y - startPoint.y;

    const nextX = clamp(startRect.x + deltaX, 0, naturalWidth - startRect.width);
    const nextY = clamp(startRect.y + deltaY, 0, naturalHeight - startRect.height);
    return { ...startRect, x: nextX, y: nextY };
};

export const calculateHandleRect = ({
    handle,
    startRect,
    point,
    aspect,
    keepAspect,
}) => {
    if (!startRect || !point) return null;
    const maxX = point.bounds.naturalWidth;
    const maxY = point.bounds.naturalHeight;

    let { x, y, width, height } = startRect;
    const right = startRect.x + startRect.width;
    const bottom = startRect.y + startRect.height;

    const applyAspect = (fixedX, fixedY, newWidth, newHeight) => {
        if (!keepAspect) return { x: fixedX, y: fixedY, width: newWidth, height: newHeight };
        let adjustedWidth = newWidth;
        let adjustedHeight = newHeight;
        const targetAspect = aspect || 1;
        const currentRatio = newWidth / newHeight || targetAspect;
        if (currentRatio > targetAspect) {
            adjustedWidth = newHeight * targetAspect;
        } else {
            adjustedHeight = newWidth / targetAspect;
        }
        return { x: fixedX, y: fixedY, width: adjustedWidth, height: adjustedHeight };
    };

    switch (handle) {
        case "n": {
            const newY = clamp(point.y, 0, bottom - MIN_SIZE);
            const newHeight = bottom - newY;
            y = newY;
            height = newHeight;
            break;
        }
        case "s": {
            const newBottom = clamp(point.y, y + MIN_SIZE, maxY);
            height = newBottom - y;
            break;
        }
        case "w": {
            const newX = clamp(point.x, 0, right - MIN_SIZE);
            width = right - newX;
            x = newX;
            break;
        }
        case "e": {
            const newRight = clamp(point.x, x + MIN_SIZE, maxX);
            width = newRight - x;
            break;
        }
        case "nw": {
            const newX = clamp(point.x, 0, right - MIN_SIZE);
            const newY = clamp(point.y, 0, bottom - MIN_SIZE);
            const newWidth = right - newX;
            const newHeight = bottom - newY;
            const sized = applyAspect(newX, newY, newWidth, newHeight);
            x = right - sized.width;
            y = bottom - sized.height;
            width = sized.width;
            height = sized.height;
            break;
        }
        case "ne": {
            const newRight = clamp(point.x, x + MIN_SIZE, maxX);
            const newY = clamp(point.y, 0, bottom - MIN_SIZE);
            const newWidth = newRight - x;
            const newHeight = bottom - newY;
            const sized = applyAspect(x, newY, newWidth, newHeight);
            y = bottom - sized.height;
            width = sized.width;
            height = sized.height;
            break;
        }
        case "sw": {
            const newX = clamp(point.x, 0, right - MIN_SIZE);
            const newBottom = clamp(point.y, y + MIN_SIZE, maxY);
            const newWidth = right - newX;
            const newHeight = newBottom - y;
            const sized = applyAspect(newX, y, newWidth, newHeight);
            x = right - sized.width;
            width = sized.width;
            height = sized.height;
            break;
        }
        case "se": {
            const newRight = clamp(point.x, x + MIN_SIZE, maxX);
            const newBottom = clamp(point.y, y + MIN_SIZE, maxY);
            const newWidth = newRight - x;
            const newHeight = newBottom - y;
            const sized = applyAspect(x, y, newWidth, newHeight);
            width = sized.width;
            height = sized.height;
            break;
        }
        default:
            break;
    }

    const clampedX = clamp(x, 0, maxX - MIN_SIZE);
    const clampedY = clamp(y, 0, maxY - MIN_SIZE);
    const maxWidth = maxX - clampedX;
    const maxHeight = maxY - clampedY;

    return {
        x: clampedX,
        y: clampedY,
        width: clamp(width, MIN_SIZE, maxWidth),
        height: clamp(height, MIN_SIZE, maxHeight),
    };
};
