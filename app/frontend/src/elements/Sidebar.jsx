import { useMemo } from "react";
import Selection from "./Selection.jsx";
import BasicTools from "./BasicTools.jsx";
import styles from "../styles/Sidebar.module.css";

function Sidebar({
    onOpenFolder,
    onToggleCrop,
    onSendImage,
    onAddCover,
    onUndo,
    onShowMeta,
    onSaveImage,
    isCropping,
    canSendImage,
    ocrText,
    ocrStatus,
    ocrError,
    onCopyOcrText,
    onOcrTextChange,
    copyFeedback,
    onToggleCovers,
    coversEnabled,
    onDetectTextRegions,
    onDetectFaces,
    coverFilters = [],
    coverOptions = [],
    onCoverFilterChange,
    coverColor,
    onCoverColorChange,
    canUndo,
}) {
    const listCovers = coverOptions;
    const cover = coverFilters || [];

    const handleCheckboxChange = (value) => {
        const next = cover.includes(value) ? cover.filter((item) => item !== value) : [...cover, value];
        onCoverFilterChange?.(next);
    };

    const ocrStatusMessage = useMemo(() => {
        if (ocrStatus === "loading") return "Reading text from the selected area...";
        if (ocrStatus === "success") return "Text detected, copy or edit below.";
        if (ocrStatus === "error") return "Could not read text.";
        return "Press File info to extract text from the current image.";
    }, [ocrStatus]);

    return (
        <div className={styles.sidebar}>
            <Selection
                title="Covers"
                type="checkbox"
                options={listCovers}
                value={cover}
                onChange={(e) => handleCheckboxChange(e.target.value)}
            />

            <div className={styles.colorPickerRow}>
                <label htmlFor="coverColor">Cover color</label>
                <div className={styles.colorPicker}>
                    <input
                        id="coverColor"
                        type="color"
                        value={coverColor}
                        onChange={(e) => onCoverColorChange?.(e.target.value)}
                    />
                </div>
            </div>

            <BasicTools
                className={styles.tools}
                onOpenFolder={onOpenFolder}
                onToggleCrop={onToggleCrop}
                onSendImage={onSendImage}
                onAdd={onAddCover}
                onUndo={onUndo}
                onShowMeta={onShowMeta}
                onSave={onSaveImage}
                isCropping={isCropping}
                canSendImage={canSendImage}
                canSaveImage={canSendImage}
                canUndo={canUndo}
            />

            <div className={styles.tools} style={{ marginTop: "12px" }}>
                <button type="button" onClick={onToggleCovers}>
                    {coversEnabled ? "Hide covers" : "Show covers"}
                </button>
                <button type="button" onClick={onDetectTextRegions}>
                    Detect text regions
                </button>
                <button type="button" onClick={onDetectFaces}>
                    Detect faces
                </button>
            </div>

            <div className={styles.ocrCard}>
                <h3>File info</h3>
                <p className={styles.ocrStatus}>{ocrStatusMessage}</p>
                <textarea
                    className={styles.ocrText}
                    placeholder="Recognized text will appear here."
                    value={ocrText}
                    onChange={(e) => onOcrTextChange?.(e.target.value)}
                    rows={6}
                />
                <div className={styles.ocrActions}>
                    <button type="button" onClick={onCopyOcrText} disabled={!ocrText}>
                        Copy text
                    </button>
                    {copyFeedback ? <span className={styles.copyFeedback}>{copyFeedback}</span> : null}
                </div>
                {ocrError ? <p className={styles.error}>{ocrError}</p> : null}
            </div>
        </div>
    );
}

export default Sidebar;
