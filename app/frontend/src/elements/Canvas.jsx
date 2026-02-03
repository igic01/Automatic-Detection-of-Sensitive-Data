import { useCallback, useEffect, useRef, useState } from "react";
import { usePan } from "./libCanvas/usePan";
import { useZoom } from "./libCanvas/useZoom";
import { useClipboardImage } from "./libCanvas/useClipboardImage";
import { useCrop } from "./libCanvas/useCrop";
import { useImageSender } from "./libCanvas/useImageSender";
import { useCoverDrag } from "./libCanvas/useCoverDrag";
import CropOverlay from "./CropOverlay";
import styles from "../styles/Canvas.module.css";

export default function Canvas({
    src,
    onRegisterOpenFile,
    onRegisterCropActions,
    onRegisterImageAccess,
    onCropModeChange,
    onImageChange,
    coversEnabled = false,
    coverOrigin = { x: 0, y: 0 },
    coverRects = [],
    isDetectingRegions = false,
    onRemoveCover,
    onUpdateCoverRect,
    onBeginCoverChange,
    onEndCoverChange,
    coverColor = "#000",
}) {
    const containerRef = useRef(null);
    const imageRef = useRef(null);
    const cropBlobRef = useRef(null);
    const hasCropRef = useRef(false);
    const copyTimeoutRef = useRef(null);
    const [copyFeedback, setCopyFeedback] = useState("");
    const { scale } = useZoom(containerRef);
    const { offset, isDragging, handleMouseDown, handleMouseMove, endDrag } = usePan();
    const getCroppedBlobProxy = useCallback(() => {
        const fn = cropBlobRef.current;
        return fn ? fn() : null;
    }, []);
    const getHasCrop = useCallback(() => hasCropRef.current, []);
    const handleCopyFeedback = useCallback((ok) => {
        const message = ok ? "Image copied" : "Copy failed";
        setCopyFeedback(message);
        if (copyTimeoutRef.current) {
            clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => setCopyFeedback(""), 1500);
    }, []);

    const getCoversWithOrigin = useCallback(() => {
        const origin = coverOrigin || { x: 0, y: 0 };
        if (!coversEnabled || !coverRects.length) return { covers: [], origin };
        const colored = coverRects.map((rect) => ({
            ...rect,
            color: coverColor || rect.color || "#000",
        }));
        return { covers: colored, origin };
    }, [coverColor, coverRects, coverOrigin, coversEnabled]);

    const {
        imageSrc,
        imageName,
        fileInputRef,
        handleFiles,
        triggerFileDialog,
        getImageBlob,
        copyImageToClipboard,
    } = useClipboardImage({
        initialSrc: src,
        onImageChange,
        getCroppedBlob: getCroppedBlobProxy,
        getHasCrop,
        getCovers: getCoversWithOrigin,
        onCopy: handleCopyFeedback,
    });
    const {
        isCropping,
        cropRect,
        overlayBox,
        handlePositions,
        isDraggingCrop,
        startCrop,
        finishCrop,
        toggleCrop,
        beginHandleDrag,
        beginMoveDrag,
        appliedOverlayBox,
        appliedClipStyle,
        appliedCropRect,
        hasAppliedCrop,
        getCroppedBlob,
        metrics,
        setAppliedCropRect,
    } = useCrop({
        containerRef,
        imageRef,
        scale,
        offset,
        imageSrc,
        onStateChange: onCropModeChange,
        getCovers: getCoversWithOrigin,
    });

    const {
        activeCoverId,
        isDraggingCover,
        coverBoxes,
        beginCoverHandleDrag,
        beginCoverMoveDrag,
        clearActiveCover,
    } = useCoverDrag({
        containerRef,
        imageRef,
        scale,
        offset,
        metrics,
        coverRects,
        coverOrigin,
        coversEnabled,
        appliedCropRect,
        isCropping,
        onUpdateCoverRect,
        onBeginCoverChange,
        onEndCoverChange,
    });

    const { buildFormData, sendToBackend } = useImageSender({ getImageBlob, getCroppedBlob });

    useEffect(() => {
        cropBlobRef.current = getCroppedBlob;
        hasCropRef.current = !!hasAppliedCrop;
    }, [getCroppedBlob, hasAppliedCrop]);

    useEffect(() => () => {
        if (copyTimeoutRef.current) {
            clearTimeout(copyTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        if (onRegisterOpenFile) {
            onRegisterOpenFile(triggerFileDialog);
        }
    }, [onRegisterOpenFile, triggerFileDialog]);

    useEffect(() => {
        if (onRegisterCropActions) {
            onRegisterCropActions({
                toggle: () => {
                    if (isCropping && cropRect) {
                        onBeginCoverChange?.();
                    }
                    toggleCrop();
                    onEndCoverChange?.();
                },
                finish: () => {
                    if (isCropping && cropRect) {
                        onBeginCoverChange?.();
                    }
                    const result = finishCrop();
                    onEndCoverChange?.();
                    return result;
                },
                start: () => startCrop(),
            });
        }
    }, [
        cropRect,
        finishCrop,
        isCropping,
        onBeginCoverChange,
        onEndCoverChange,
        onRegisterCropActions,
        startCrop,
        toggleCrop,
    ]);

    useEffect(() => {
        if (!onRegisterImageAccess) return;
        onRegisterImageAccess({
            getImageBlob,
            getCroppedBlob,
            getHasCrop,
            buildFormData,
            sendToBackend,
            imageSrc,
            imageName,
            getAppliedCropRect: () => appliedCropRect || null,
            setAppliedCropRect: (rect) => setAppliedCropRect?.(rect),
            getImageMetrics: () => {
                const image = imageRef.current;
                if (!image) return null;
                const naturalWidth = image.naturalWidth || 0;
                const naturalHeight = image.naturalHeight || 0;
                if (!naturalWidth || !naturalHeight) return null;
                return { naturalWidth, naturalHeight };
            },
        });
    }, [
        buildFormData,
        getCroppedBlob,
        getHasCrop,
        getImageBlob,
        imageName,
        imageSrc,
        imageRef,
        onRegisterImageAccess,
        sendToBackend,
        appliedCropRect,
        setAppliedCropRect,
    ]);

    useEffect(() => {
        if (!isCropping) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (cropRect) {
                    onBeginCoverChange?.();
                }
                finishCrop();
                onEndCoverChange?.();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [cropRect, finishCrop, isCropping, onBeginCoverChange, onEndCoverChange]);

    const handleContextMenuCopy = useCallback(
        (event) => {
            if (!imageSrc) return;
            if (!containerRef.current?.contains(event.target)) return;
            event.preventDefault();
            copyImageToClipboard();
        },
        [copyImageToClipboard, imageSrc]
    );

    const containerClasses = [
        styles.container,
        isDragging || isDraggingCrop || isDraggingCover ? styles.dragging : "",
        isCropping ? styles.cropping : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            ref={containerRef}
            className={containerClasses}
            onMouseDown={(event) => {
                clearActiveCover();
                if (!isCropping) {
                    handleMouseDown(event);
                    return;
                }
                if (event.target === containerRef.current) {
                    handleMouseDown(event);
                }
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            tabIndex={0}
            onContextMenu={handleContextMenuCopy}
        >
            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className={styles.hiddenInput}
                onChange={(e) => {
                    handleFiles(e.target.files);
                    // Allow selecting the same file again by clearing the input.
                    e.target.value = "";
                }}
            />

            {!imageSrc && (
                <div className={styles.placeholder}>
                    <button
                        type="button"
                        onClick={triggerFileDialog}
                        className={`${styles.button} ${styles.buttonLarge}`}
                    >
                        Open file
                    </button>
                </div>
            )}

            {imageSrc && (
                <img
                    ref={imageRef}
                    src={imageSrc}
                    alt=""
                    draggable={false}
                    className={styles.image}
                    style={{
                        transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        ...(!isCropping && appliedClipStyle ? appliedClipStyle : null),
                    }}
                />
            )}

            {!isCropping && appliedOverlayBox && (
                <div
                    className={styles.appliedOverlay}
                    style={{
                        left: appliedOverlayBox.relativeLeft,
                        top: appliedOverlayBox.relativeTop,
                        width: appliedOverlayBox.width,
                        height: appliedOverlayBox.height,
                        pointerEvents: "none",
                    }}
                />
            )}

            {coverBoxes.length > 0 && metrics && (
                <div
                    className={styles.coverHost}
                    style={{ pointerEvents: isCropping ? "none" : "auto" }}
                >
                    <div
                        className={styles.coverLayer}
                        style={{
                            width: metrics.boxWidth,
                            height: metrics.boxHeight,
                            transform: `translate(${metrics.relativeLeft}px, ${metrics.relativeTop}px)`,
                            pointerEvents: isCropping ? "none" : "auto",
                            ...(!isCropping && appliedClipStyle ? appliedClipStyle : {}),
                        }}
                    >
                        {coverBoxes.map((box, idx) => (
                            <div
                                key={box.id || idx}
                                className={`${styles.coverBlock} ${box.id === activeCoverId ? styles.coverSelected : ""}`}
                                style={{
                                    left: box.overlay.relativeLeft - metrics.relativeLeft,
                                    top: box.overlay.relativeTop - metrics.relativeTop,
                                    width: box.overlay.width,
                                    height: box.overlay.height,
                                    filter: isCropping ? "grayscale(1)" : undefined,
                                    background: coverColor || "#000",
                                    "--cover-color": coverColor || "#000",
                                    "--cover-opacity": isCropping ? 0.5 : 1,
                                }}
                                onMouseDown={(event) => beginCoverMoveDrag(box, event)}
                                role="presentation"
                            >
                                {box.id === activeCoverId && !isCropping && (
                                    <>
                                        {box.handlePositions.map((handle) => (
                                            <div
                                                key={handle.id}
                                                className={styles.coverHandle}
                                                style={{
                                                    left: handle.x - box.overlay.relativeLeft,
                                                    top: handle.y - box.overlay.relativeTop,
                                                    cursor: handle.cursor,
                                                }}
                                                onMouseDown={(event) => beginCoverHandleDrag(handle.id, box, event)}
                                            />
                                        ))}
                                        {typeof onRemoveCover === "function" && (
                                            <button
                                                type="button"
                                                className={styles.coverRemove}
                                                onMouseDown={(event) => event.stopPropagation()}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onRemoveCover(box.id ?? idx);
                                                }}
                                                aria-label="Remove cover"
                                                title="Remove cover"
                                            >
                                                x
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {isCropping && overlayBox && (
                <CropOverlay
                    overlayBox={overlayBox}
                    handlePositions={handlePositions}
                    onOverlayMouseDown={beginMoveDrag}
                    onHandleMouseDown={beginHandleDrag}
                />
            )}

            {isDetectingRegions && (
                <div className={styles.detectBanner}>Detecting regions...</div>
            )}

            {copyFeedback && (
                <div className={styles.copyBanner} role="status" aria-live="polite">
                    {copyFeedback}
                </div>
            )}

        </div>
    );
}
