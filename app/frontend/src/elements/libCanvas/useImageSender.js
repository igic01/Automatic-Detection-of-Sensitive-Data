import { useCallback } from "react";

export function useImageSender({ getImageBlob, getCroppedBlob } = {}) {
    const buildFormData = useCallback(
        async (extraFields = {}) => {
            if (!getImageBlob && !getCroppedBlob) return null;
            const payload = (await getCroppedBlob?.()) || (await getImageBlob?.());
            if (!payload) return null;

            const formData = new FormData();
            formData.append("image", payload.blob, payload.name || "selected-image.png");
            Object.entries(extraFields).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    formData.append(key, value);
                }
            });

            return { formData, name: payload.name };
        },
        [getCroppedBlob, getImageBlob]
    );

    const sendToBackend = useCallback(
        async ({ endpoint, extraFields = {}, fetchOptions = {} } = {}) => {
            const built = await buildFormData(extraFields);
            if (!built) {
                return { ok: false, reason: "no-image" };
            }
            if (!endpoint) {
                return { ok: false, reason: "missing-endpoint", ...built };
            }

            const response = await fetch(endpoint, {
                method: "POST",
                body: built.formData,
                ...fetchOptions,
            });

            return { ok: response.ok, status: response.status, response, ...built };
        },
        [buildFormData]
    );

    return { buildFormData, sendToBackend };
}
