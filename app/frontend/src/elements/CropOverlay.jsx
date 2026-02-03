import styles from "../styles/Canvas.module.css";

function CropOverlay({ overlayBox, handlePositions, onOverlayMouseDown, onHandleMouseDown }) {
    if (!overlayBox) return null;

    return (
        <div
            className={styles.cropOverlay}
            style={{
                left: overlayBox.relativeLeft,
                top: overlayBox.relativeTop,
                width: overlayBox.width,
                height: overlayBox.height,
                boxShadow: "0 0 0 2000px rgba(0, 0, 0, 0.45)",
            }}
            onMouseDown={onOverlayMouseDown}
        >
            {handlePositions.map((handle) => (
                <div
                    key={handle.id}
                    className={styles.cropHandle}
                    style={{
                        left: handle.x - overlayBox.relativeLeft,
                        top: handle.y - overlayBox.relativeTop,
                        cursor: handle.cursor,
                    }}
                    onMouseDown={(e) => onHandleMouseDown(handle.id, e)}
                />
            ))}
        </div>
    );
}

export default CropOverlay;
