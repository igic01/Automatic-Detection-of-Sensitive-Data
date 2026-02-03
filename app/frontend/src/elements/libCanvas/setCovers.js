const TEST_COVERS = [
    {
        x: 20,
        y: 10,
        width: 20,
        height: 100,
        color: "#000",
    },
];

export const getTestCovers = () => TEST_COVERS;

const intersect = (cover, region) => {
    if (!region) return cover;
    const x = Math.max(cover.x, region.x);
    const y = Math.max(cover.y, region.y);
    const right = Math.min(cover.x + cover.width, region.x + region.width);
    const bottom = Math.min(cover.y + cover.height, region.y + region.height);
    const width = Math.max(0, right - x);
    const height = Math.max(0, bottom - y);
    if (!width || !height) return null;
    return { ...cover, x, y, width, height };
};

export function drawCovers({ ctx, covers = [], offsetX = 0, offsetY = 0, cropRegion = null }) {
    covers.forEach((cover) => {
        const clipped = intersect(cover, cropRegion);
        if (!clipped) return;
        ctx.fillStyle = clipped.color || "#000";
        ctx.fillRect(clipped.x + offsetX, clipped.y + offsetY, clipped.width, clipped.height);
    });
}

export async function applyCoversToBlob({ blob, name = "image-with-covers.png", covers = [], cropRect }) {
    if (!blob) return null;

    const bitmap =
        typeof createImageBitmap === "function"
            ? await createImageBitmap(blob)
            : await new Promise((resolve, reject) => {
                  const img = new Image();
                  img.onload = () => {
                      URL.revokeObjectURL(img.src);
                      resolve(img);
                  };
                  img.onerror = (err) => {
                      URL.revokeObjectURL(img.src);
                      reject(err);
                  };
                  img.src = URL.createObjectURL(blob);
              });

    const sx = cropRect?.x ? Math.max(0, Math.round(cropRect.x)) : 0;
    const sy = cropRect?.y ? Math.max(0, Math.round(cropRect.y)) : 0;
    const width = cropRect?.width ? Math.max(1, Math.round(cropRect.width)) : bitmap.width;
    const height = cropRect?.height ? Math.max(1, Math.round(cropRect.height)) : bitmap.height;

    const createCanvas = () => {
        if (typeof OffscreenCanvas !== "undefined") {
            return new OffscreenCanvas(width, height);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    };

    const canvas = createCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(bitmap, -sx, -sy);
    drawCovers({
        ctx,
        covers,
        offsetX: -sx,
        offsetY: -sy,
        cropRegion: cropRect
            ? { x: sx, y: sy, width, height }
            : { x: 0, y: 0, width, height },
    });

    if (typeof bitmap.close === "function") {
        bitmap.close();
    }

    const resultBlob =
        typeof canvas.convertToBlob === "function"
            ? await canvas.convertToBlob({ type: "image/png" })
            : await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

    return resultBlob ? { blob: resultBlob, name } : null;
}
