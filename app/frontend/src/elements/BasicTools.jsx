import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-KIT_CODE/icons";

const toolIcons = [
    { id: "add", icon: byPrefixAndName.fas["plus"], label: "Add new" },
    { id: "open", icon: byPrefixAndName.far["folder-open"], label: "Open image" },
    { id: "save", icon: byPrefixAndName.fas["floppy-disk"], label: "Save" },
    { id: "undo", icon: byPrefixAndName.fas["rotate-left"], label: "Undo" },
    { id: "crop", icon: byPrefixAndName.fas["crop"], label: "Toggle crop" },
    { id: "meta", icon: byPrefixAndName.far["file-lines"], label: "File info" },
];

function BasicTools({
    className,
    onOpenFolder,
    onToggleCrop,
    onSendImage,
    onAdd,
    onSave,
    onUndo,
    onShowMeta,
    isCropping,
    canSendImage,
    canSaveImage,
    canUndo,
}) {
    const handlerMap = {
        add: onAdd,
        open: onOpenFolder,
        save: onSave,
        undo: onUndo,
        crop: onToggleCrop,
        meta: onShowMeta,
        send: onSendImage,
    };

    const handleClick = (id) => {
        handlerMap[id]?.();
    };

    return (
        <div className={className}>
            {toolIcons.map(({ id, icon, label }) => {
                const active = id === "crop" && isCropping;
                const disabled =
                    (id === "send" && !canSendImage) ||
                    (id === "save" && !canSaveImage) ||
                    (id === "undo" && !canUndo) ||
                    (!handlerMap[id] && id !== "crop" && id !== "open" && id !== "send");
                return (
                    <button
                        key={id}
                        type="button"
                        aria-label={label}
                        onClick={() => handleClick(id)}
                        disabled={disabled}
                        style={{
                            background: active ? "rgba(13, 110, 253, 0.1)" : "transparent",
                            border: active ? "1px solid #0d6efd" : "none",
                            padding: "8px",
                            cursor: disabled ? "not-allowed" : "pointer",
                            color: active ? "#0d6efd" : "inherit",
                            opacity: disabled ? 0.5 : 1,
                            borderRadius: "6px",
                        }}
                    >
                        <FontAwesomeIcon icon={icon} size="lg" aria-hidden />
                    </button>
                );
            })}
        </div>
    );
}

export default BasicTools;
