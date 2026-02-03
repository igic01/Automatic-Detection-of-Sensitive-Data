/**
 * Attempts to build a clipboard payload, preferring the active crop.
 * Falls back to the full image when no crop is available.
 */
export async function copyCrop({ getCroppedBlob, getImageBlob, hasCrop, getHasCrop }) {
    const cropPresent =
        typeof getHasCrop === "function" ? !!getHasCrop() : typeof hasCrop === "boolean" ? hasCrop : false;

    try {
        if (typeof getCroppedBlob === "function") {
            const cropped = await getCroppedBlob();
            if (cropped?.blob) {
                return cropped;
            }
        }
    } catch (error) {
        console.error("Failed to build cropped clipboard blob", error);
        if (cropPresent) return null;
    }

    if (cropPresent) return null;

    try {
        return typeof getImageBlob === "function" ? await getImageBlob() : null;
    } catch (error) {
        console.error("Failed to build original clipboard blob", error);
        return null;
    }
}
