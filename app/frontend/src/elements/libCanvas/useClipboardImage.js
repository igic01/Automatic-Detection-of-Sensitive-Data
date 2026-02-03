import { useCallback, useEffect, useRef, useState } from "react";
import { copyCrop } from "./copyCrop";
import { applyCoversToBlob } from "./setCovers";

function useImageStore({ initialSrc, initialName, onImageChange }) {
    const [imageSrc, setImageSrc] = useState(initialSrc);
    const [imageBlob, setImageBlob] = useState(null);
    const [imageName, setImageName] = useState(initialName);
    const lastObjectUrlRef = useRef(null);
    const fileInputRef = useRef(null);
    const onImageChangeRef = useRef(onImageChange);

    const cleanupObjectUrl = useCallback(() => {
        if (lastObjectUrlRef.current) {
            URL.revokeObjectURL(lastObjectUrlRef.current);
            lastObjectUrlRef.current = null;
        }
    }, []);

    const setFromBlob = useCallback(
        (blob, name = "pasted-image.png") => {
            if (!blob) return;
            cleanupObjectUrl();
            const url = URL.createObjectURL(blob);
            lastObjectUrlRef.current = url;
            setImageSrc(url);
            setImageBlob(blob);
            setImageName(name);
        },
        [cleanupObjectUrl]
    );

    const handleFiles = useCallback(
        (fileList) => {
            if (!fileList?.length) return;
            const imageFile = Array.from(fileList).find((file) => file.type.startsWith("image/"));
            if (imageFile) {
                const sameName = imageName && imageFile.name === imageName;
                if (sameName) {
                    const confirmed = window.confirm(
                        "You are reopening the same image. This will reset covers and selections. Continue?"
                    );
                    if (!confirmed) return;
                }
                setFromBlob(imageFile, imageFile.name || initialName);
            }
        },
        [imageName, initialName, setFromBlob]
    );

    const triggerFileDialog = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const getImageBlob = useCallback(async () => {
        if (imageBlob) {
            return { blob: imageBlob, name: imageName };
        }
        if (!imageSrc) return null;
        try {
            const response = await fetch(imageSrc);
            const blob = await response.blob();
            return { blob, name: imageName };
        } catch (error) {
            console.error("Failed to get image blob", error);
            return null;
        }
    }, [imageBlob, imageName, imageSrc]);

    const clearImage = useCallback(() => {
        cleanupObjectUrl();
        setImageSrc("");
        setImageBlob(null);
        setImageName(initialName);
        onImageChange?.(null);
    }, [cleanupObjectUrl, initialName, onImageChange]);

    useEffect(() => {
        onImageChangeRef.current = onImageChange;
    }, [onImageChange]);

    useEffect(
        () => () => {
            cleanupObjectUrl();
        },
        [cleanupObjectUrl]
    );

    useEffect(() => {
        const handler = onImageChangeRef.current;
        if (!handler) return;
        if (!imageSrc) {
            handler(null);
            return;
        }
        handler({
            blob: imageBlob,
            src: imageSrc,
            name: imageName,
        });
    }, [imageBlob, imageName, imageSrc]);

    return {
        imageSrc,
        imageBlob,
        imageName,
        setImageSrc,
        setFromBlob,
        fileInputRef,
        handleFiles,
        triggerFileDialog,
        clearImage,
        getImageBlob,
    };
}

function useClipboardHandlers({
    imageSrc,
    setFromBlob,
    getImageBlob,
    getCroppedBlob,
    getHasCrop,
    onCopy,
}) {
    const copyImageToClipboard = useCallback(async () => {
        if (!navigator.clipboard?.write) {
            onCopy?.(false);
            return false;
        }
        const payload = await copyCrop({ getCroppedBlob, getImageBlob, getHasCrop });
        if (!payload) {
            onCopy?.(false);
            return false;
        }

        try {
            await navigator.clipboard.write([
                new ClipboardItem({ [payload.blob.type || "image/png"]: payload.blob }),
            ]);
            onCopy?.(true);
            return true;
        } catch (error) {
            console.error("Failed to copy image to clipboard:", error);
            onCopy?.(false);
            return false;
        }
    }, [getCroppedBlob, getHasCrop, getImageBlob, onCopy]);

    const handlePasteEvent = useCallback(
        (event) => {
            const items = event.clipboardData?.items;
            const files = event.clipboardData?.files;

            const imageItem = items && Array.from(items).find((item) => item.type?.startsWith("image/"));
            const fileFromItems = imageItem?.getAsFile();
            const fileFromFiles = files && Array.from(files).find((file) => file.type?.startsWith("image/"));
            const file = fileFromItems || fileFromFiles;

            if (!file) return;

            event.preventDefault();
            setFromBlob(file, file.name || "pasted-image.png");
        },
        [setFromBlob]
    );

    const pasteFromClipboard = useCallback(async () => {
        if (navigator.clipboard?.read) {
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const type = item.types.find((t) => t.startsWith("image/"));
                    if (type) {
                        const blob = await item.getType(type);
                        setFromBlob(blob, "clipboard-image.png");
                        return true;
                    }
                }
            } catch (error) {
                console.error("Failed to paste image from clipboard:", error);
            }
        }
        return false;
    }, [setFromBlob]);

    useEffect(() => {
        const isEditableTarget = (target) =>
            target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

        const handleKeyDown = (e) => {
            const isModifier = e.ctrlKey || e.metaKey;
            if (!isModifier) return;

            if (isEditableTarget(e.target)) return;

            const key = e.key?.toLowerCase();
            if (key === "v") {
                pasteFromClipboard();
            } else if (key === "c" && imageSrc) {
                e.preventDefault();
                copyImageToClipboard();
            }
        };

        const handleCopy = (e) => {
            if (!imageSrc) return;
            if (isEditableTarget(e.target)) return;
            e.preventDefault();
            copyImageToClipboard();
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("paste", handlePasteEvent);
        window.addEventListener("copy", handleCopy);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("paste", handlePasteEvent);
            window.removeEventListener("copy", handleCopy);
        };
    }, [copyImageToClipboard, handlePasteEvent, imageSrc, pasteFromClipboard]);

    return { copyImageToClipboard, pasteFromClipboard };
}

export function useClipboardImage({
    initialSrc = "",
    initialName = "selected-image.png",
    onImageChange,
    getCroppedBlob,
    getHasCrop,
    getCovers,
    onCopy,
} = {}) {
    const imageStore = useImageStore({ initialSrc, initialName, onImageChange });
    const getImageBlobWithCovers = useCallback(async () => {
        const base = await imageStore.getImageBlob();
        const coversPayload = typeof getCovers === "function" ? getCovers() : [];
        const covers = Array.isArray(coversPayload) ? coversPayload : coversPayload?.covers || [];
        const origin = Array.isArray(coversPayload) ? { x: 0, y: 0 } : coversPayload?.origin || { x: 0, y: 0 };
        if (!base?.blob || !covers?.length) return base;

        const absoluteCovers = covers.map((cover) => ({
            ...cover,
            x: (cover?.x || 0) + (origin?.x || 0),
            y: (cover?.y || 0) + (origin?.y || 0),
        }));

        const withCovers = await applyCoversToBlob({
            blob: base.blob,
            name: base.name,
            covers: absoluteCovers,
        });
        return withCovers || base;
    }, [getCovers, imageStore]);

    const { copyImageToClipboard, pasteFromClipboard } = useClipboardHandlers({
        imageSrc: imageStore.imageSrc,
        setFromBlob: imageStore.setFromBlob,
        getImageBlob: getImageBlobWithCovers,
        getCroppedBlob,
        getHasCrop,
        onCopy,
    });

    return {
        ...imageStore,
        getImageBlob: getImageBlobWithCovers,
        copyImageToClipboard,
        pasteFromClipboard,
    };
}
