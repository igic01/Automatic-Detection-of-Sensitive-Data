import { useCallback, useMemo, useRef, useState } from "react";
import Sidebar from "./elements/Sidebar.jsx";
import Canvas from "./elements/Canvas.jsx";

function App() {
  const openFileRef = useRef(null);
  const cropActionsRef = useRef(null);
  const imageAccessRef = useRef(null);
  const undoStackRef = useRef([]);
  const coverChangeActiveRef = useRef(false);
  const [isCropping, setIsCropping] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrStatus, setOcrStatus] = useState("idle"); // idle | loading | success | error
  const [ocrError, setOcrError] = useState(null);
  const [ocrCopyFeedback, setOcrCopyFeedback] = useState("");
  const [coversEnabled, setCoversEnabled] = useState(false);
  const [coverOrigin, setCoverOrigin] = useState({ x: 0, y: 0 });
  const [coverRects, setCoverRects] = useState([]);
  const [isDetectingRegions, setIsDetectingRegions] = useState(false);
  const [coverFilters, setCoverFilters] = useState([]);
  const [undoCount, setUndoCount] = useState(0);
  const COVER_FILTER_ORDER = useMemo(() => ["Date", "IBAN", "Phone-numbers", "Emails", "Faces", "Manual"], []);
  const TEXT_CATEGORIES = ["date", "iban", "phone-numbers", "emails"];
  const FACE_CATEGORY = "faces";
  const MANUAL_CATEGORY = "manual";
  const [coverColor, setCoverColor] = useState("#000000");

  const captureCoverState = useCallback(
    () => ({
      coverRects: coverRects.map((rect) => ({ ...rect })),
      coverOrigin: { ...coverOrigin },
      coverFilters: [...coverFilters],
      coversEnabled,
      coverColor,
      appliedCropRect: imageAccessRef.current?.getAppliedCropRect?.() || null,
    }),
    [coverColor, coverFilters, coverOrigin, coverRects, coversEnabled]
  );

  const pushUndoState = useCallback(() => {
    const snapshot = captureCoverState();
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    setUndoCount(undoStackRef.current.length);
  }, [captureCoverState]);

  const clearUndoState = useCallback(() => {
    undoStackRef.current = [];
    setUndoCount(0);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    const snapshot = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    if (!snapshot) return;
    setCoverRects(snapshot.coverRects || []);
    setCoverOrigin(snapshot.coverOrigin || { x: 0, y: 0 });
    setCoverFilters(snapshot.coverFilters || []);
    setCoversEnabled(!!snapshot.coversEnabled);
    setCoverColor(snapshot.coverColor || "#000000");
    imageAccessRef.current?.setAppliedCropRect?.(snapshot.appliedCropRect || null);
  }, []);

  const handleRegisterOpenFile = (fn) => {
    openFileRef.current = fn;
  };

  const handleRegisterCropActions = (actions) => {
    cropActionsRef.current = actions;
  };

  const handleRegisterImageAccess = (access) => {
    imageAccessRef.current = access;
  };

  const handleImageChange = (payload) => {
    clearUndoState();
    setSelectedImage(payload);
    setOcrText("");
    setOcrStatus("idle");
    setOcrError(null);
    setOcrCopyFeedback("");
    setCoverRects([]);
    setCoversEnabled(false);
    setCoverOrigin({ x: 0, y: 0 });
    setIsDetectingRegions(false);
    setCoverFilters([]);
    setCoverColor("#000000");
  };

  const handleOpenFolder = () => {
    openFileRef.current?.();
  };

  const handleToggleCrop = () => {
    cropActionsRef.current?.toggle?.();
  };

  const handleSendImage = async () => {
    const access = imageAccessRef.current;
    if (!access) return;
    const built = await access.buildFormData();
    if (!built) {
      console.warn("No image selected to send");
      return;
    }

    const endpoint = import.meta?.env?.VITE_UPLOAD_ENDPOINT;
    if (!endpoint) {
      console.info("FormData ready to send", built.formData);
      return;
    }

    try {
      const result = await access.sendToBackend({ endpoint });
      if (!result.ok) {
        console.warn("Image upload failed", result.status);
      } else {
        console.info("Image uploaded", result.status);
      }
    } catch (error) {
      console.error("Failed to send image", error);
    }
  };

  const resolveOcrEndpoint = () => {
    if (import.meta?.env?.VITE_OCR_ENDPOINT) return import.meta.env.VITE_OCR_ENDPOINT;
    // If running Vite dev server (usually port 5173), default to the Flask backend on 5000.
    if (window?.location?.port === "5173") return "http://127.0.0.1:5000/api/ocr";
    return "/api/ocr";
  };

  const handleExtractText = async () => {
    const access = imageAccessRef.current;
    if (!access) return;

    // Apply any pending crop so OCR uses the selected region.
    cropActionsRef.current?.finish?.();

    const built = await access.buildFormData();
    if (!built) {
      setOcrStatus("error");
      setOcrError("No image selected.");
      setOcrText("");
      return;
    }

    const endpoint = resolveOcrEndpoint();

    setOcrStatus("loading");
    setOcrError(null);
    setOcrCopyFeedback("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: built.formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOcrStatus("error");
        setOcrError(payload?.error || payload?.message || "Failed to read text from image.");
        setOcrText("");
        return;
      }

      setOcrText(typeof payload?.text === "string" ? payload.text : "");
      setOcrStatus("success");
    } catch (error) {
      setOcrStatus("error");
      setOcrError(error?.message || "Failed to contact OCR service.");
      setOcrText("");
    }
  };

  const handleCopyOcrText = async () => {
    if (!ocrText) return;
    try {
      await navigator.clipboard.writeText(ocrText);
      setOcrCopyFeedback("Copied!");
      setTimeout(() => setOcrCopyFeedback(""), 1500);
    } catch (error) {
      setOcrCopyFeedback("Copy failed");
      console.error("Failed to copy OCR text", error);
    }
  };

  const saveCroppedToFile = useCallback(async () => {
    const access = imageAccessRef.current;
    if (!access) return;
    const payload = (await access.getCroppedBlob?.()) || (await access.getImageBlob?.());
    if (!payload?.blob) return;

    const suggestedName = payload.name || "cropped-image.png";

    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: "Image",
              accept: {
                [payload.blob.type || "image/png"]: [".png", ".jpg", ".jpeg", ".webp", ".bmp"],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(payload.blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(payload.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = suggestedName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Failed to save cropped image", error);
      }
    }
  }, []);

  const handleSaveImage = async () => {
    const access = imageAccessRef.current;
    if (!access || !selectedImage?.src) return;

    if (isCropping) {
      cropActionsRef.current?.finish?.();
    }

    await saveCroppedToFile();
  };

  const handleToggleCovers = () => {
    pushUndoState();
    const next = !coversEnabled;
    if (next) {
      const applied = imageAccessRef.current?.getAppliedCropRect?.();
      const anchor = applied ? { x: applied.x || 0, y: applied.y || 0 } : { x: 0, y: 0 };
      setCoverOrigin(anchor);
      setCoverFilters(availableCoverLabels);
    }
    setCoversEnabled(next);
    if (!next) {
      setCoverFilters([]);
    }
  };

  const categoryLabel = (cat) => {
    switch (cat) {
      case "date":
        return "Date";
      case "iban":
        return "IBAN";
      case "phone-numbers":
        return "Phone-numbers";
      case "emails":
        return "Emails";
      case "faces":
        return "Faces";
      case MANUAL_CATEGORY:
        return "Manual";
      default:
        return cat;
    }
  };

  const availableCoverLabels = useMemo(() => {
    const available = new Set();
    coverRects.forEach((rect) => {
      const label = categoryLabel(rect.category);
      if (label) {
        available.add(label);
      }
    });
    return COVER_FILTER_ORDER.filter((label) => available.has(label));
  }, [coverRects, COVER_FILTER_ORDER]);

  const normalizeBoxes = (payload, fallbackCategory) => {
    const raw = Array.isArray(payload?.boxes) ? payload.boxes : [];
    return raw
      .filter(
        (b) =>
          typeof b?.x === "number" &&
          typeof b?.y === "number" &&
          typeof b?.width === "number" &&
          typeof b?.height === "number"
      )
      .map((b, idx) => {
        const category = b.category || fallbackCategory || "unknown";
        return {
          id: b.id ?? `${category}-${idx}`,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          color: "#000",
          category,
        };
      });
  };

  const applyDetectedBoxes = (boxes, anchor, replaceCategories = []) => {
    const anchorChanged =
      !!anchor && (anchor.x !== coverOrigin.x || anchor.y !== coverOrigin.y);
    const labels = boxes.map((b) => categoryLabel(b.category)).filter(Boolean);

    pushUndoState();
    setCoverRects((prev) => {
      const base = anchorChanged ? [] : prev;
      const filtered = replaceCategories.length
        ? base.filter((rect) => !replaceCategories.includes(rect.category))
        : base;
      return [...filtered, ...boxes];
    });

    setCoverFilters((prev) => {
      let next;
      if (anchorChanged) {
        next = labels;
      } else if (boxes.length) {
        next = Array.from(new Set([...(prev || []), ...labels]));
      } else if (replaceCategories.length) {
        next = (prev || []).filter(
          (label) => !replaceCategories.some((cat) => categoryLabel(cat) === label)
        );
      } else {
        next = prev || [];
      }
      setCoversEnabled(next.length > 0);
      return next;
    });

    if (anchor) {
      setCoverOrigin(anchor);
    }
  };

  const resolveOcrBoxesEndpoint = () => {
    if (import.meta?.env?.VITE_OCR_BOXES_ENDPOINT) return import.meta.env.VITE_OCR_BOXES_ENDPOINT;
    if (window?.location?.port === "5173") return "http://127.0.0.1:5000/api/ocr/boxes";
    return "/api/ocr/boxes";
  };

  const resolveFaceDetectionEndpoint = () => {
    if (import.meta?.env?.VITE_FACE_DETECT_ENDPOINT) return import.meta.env.VITE_FACE_DETECT_ENDPOINT;
    if (window?.location?.port === "5173") return "http://127.0.0.1:5000/api/faces";
    return "/api/faces";
  };

  const detectRegions = async ({ endpoint, fallbackCategory, replaceCategories = [] }) => {
    const access = imageAccessRef.current;
    if (!access) return;

    // Apply pending crop to align detection with visible area.
    cropActionsRef.current?.finish?.();
    const applied = access.getAppliedCropRect?.();
    const anchor = applied ? { x: applied.x || 0, y: applied.y || 0 } : { x: 0, y: 0 };

    const built = await access.buildFormData();
    if (!built) {
      console.warn("No image selected for region detection");
      return;
    }

    const targetEndpoint = endpoint || resolveOcrBoxesEndpoint();
    if (!targetEndpoint) {
      console.warn("Missing detection endpoint");
      return;
    }

    try {
      setIsDetectingRegions(true);
      const response = await fetch(targetEndpoint, {
        method: "POST",
        body: built.formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn("Region detection failed", payload);
        applyDetectedBoxes([], anchor, replaceCategories);
        return;
      }

      const boxes = normalizeBoxes(payload, fallbackCategory);
      applyDetectedBoxes(boxes, anchor, replaceCategories);
    } catch (error) {
      console.error("Failed to fetch regions", error);
      applyDetectedBoxes([], anchor, replaceCategories);
    } finally {
      setIsDetectingRegions(false);
    }
  };

  const handleDetectTextRegions = async () => {
    await detectRegions({
      endpoint: resolveOcrBoxesEndpoint(),
      replaceCategories: TEXT_CATEGORIES,
    });
  };

  const handleDetectFaces = async () => {
    await detectRegions({
      endpoint: resolveFaceDetectionEndpoint(),
      fallbackCategory: FACE_CATEGORY,
      replaceCategories: [FACE_CATEGORY],
    });
  };

  const handleRemoveCover = (id) => {
    pushUndoState();
    setCoverRects((prev) => prev.filter((rect, idx) => (rect.id ?? idx) !== id));
  };

  const handleAddCover = useCallback(() => {
    const access = imageAccessRef.current;
    const metrics = access?.getImageMetrics?.();
    if (!metrics?.naturalWidth || !metrics?.naturalHeight) return;

    pushUndoState();
    const cropRect = access?.getAppliedCropRect?.();
    const hasExisting = coverRects.length > 0;
    let origin = coverOrigin;
    if (!hasExisting) {
      origin = cropRect ? { x: cropRect.x || 0, y: cropRect.y || 0 } : { x: 0, y: 0 };
      setCoverOrigin(origin);
    }

    const useCropBounds =
      !!cropRect &&
      (!hasExisting || (coverOrigin.x === cropRect.x && coverOrigin.y === cropRect.y));
    const boundsWidth = useCropBounds ? cropRect.width : metrics.naturalWidth;
    const boundsHeight = useCropBounds ? cropRect.height : metrics.naturalHeight;
    if (!boundsWidth || !boundsHeight) return;

    const baseSize = Math.max(60, Math.min(180, Math.min(boundsWidth, boundsHeight) * 0.25));
    const width = Math.min(boundsWidth, Math.max(40, baseSize * 1.2));
    const height = Math.min(boundsHeight, Math.max(30, baseSize));
    const x = Math.max(0, (boundsWidth - width) / 2);
    const y = Math.max(0, (boundsHeight - height) / 2);

    setCoverRects((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}-${prev.length}`,
        x,
        y,
        width,
        height,
        category: MANUAL_CATEGORY,
      },
    ]);

    setCoverFilters((prev) => {
      const label = "Manual";
      if (prev?.length) {
        return prev.includes(label) ? prev : [...prev, label];
      }
      return [label];
    });
    setCoversEnabled(true);
  }, [coverOrigin, coverRects.length, pushUndoState]);

  const handleBeginCoverChange = useCallback(() => {
    if (coverChangeActiveRef.current) return;
    pushUndoState();
    coverChangeActiveRef.current = true;
  }, [pushUndoState]);

  const handleEndCoverChange = useCallback(() => {
    coverChangeActiveRef.current = false;
  }, []);

  const handleCoverFilterChange = (filters) => {
    pushUndoState();
    setCoverFilters(filters || []);
    if (filters && filters.length && !coversEnabled) {
      setCoversEnabled(true);
    } else if (!filters?.length) {
      setCoversEnabled(false);
    }
  };

  const handleCoverColorChange = useCallback(
    (nextColor) => {
      if (!nextColor || nextColor === coverColor) return;
      pushUndoState();
      setCoverColor(nextColor);
    },
    [coverColor, pushUndoState]
  );

  const handleUpdateCoverRect = useCallback((id, nextRect) => {
    if (!id || !nextRect) return;
    setCoverRects((prev) =>
      prev.map((rect) => (rect.id === id ? { ...rect, ...nextRect } : rect))
    );
  }, []);

  const visibleCoverRects = coverFilters.length
    ? coverRects.filter((rect) => coverFilters.includes(categoryLabel(rect.category)))
    : [];

  return (
    <>
      <Canvas
        onRegisterOpenFile={handleRegisterOpenFile}
        onRegisterCropActions={handleRegisterCropActions}
        onRegisterImageAccess={handleRegisterImageAccess}
        onCropModeChange={setIsCropping}
        onImageChange={handleImageChange}
        coversEnabled={coversEnabled}
        coverOrigin={coverOrigin}
        coverRects={visibleCoverRects}
        isDetectingRegions={isDetectingRegions}
        onRemoveCover={handleRemoveCover}
        onUpdateCoverRect={handleUpdateCoverRect}
        onBeginCoverChange={handleBeginCoverChange}
        onEndCoverChange={handleEndCoverChange}
        coverColor={coverColor}
      />
      <Sidebar
        onOpenFolder={handleOpenFolder}
        onToggleCrop={handleToggleCrop}
        onSendImage={handleSendImage}
        onAddCover={handleAddCover}
        onUndo={handleUndo}
        onShowMeta={handleExtractText}
        onSaveImage={handleSaveImage}
        isCropping={isCropping}
        canSendImage={!!selectedImage?.src}
        canSaveImage={!!selectedImage?.src}
        ocrText={ocrText}
        ocrStatus={ocrStatus}
        ocrError={ocrError}
        onCopyOcrText={handleCopyOcrText}
        onOcrTextChange={setOcrText}
        copyFeedback={ocrCopyFeedback}
        onToggleCovers={handleToggleCovers}
        coversEnabled={coversEnabled}
        onDetectTextRegions={handleDetectTextRegions}
        onDetectFaces={handleDetectFaces}
        coverFilters={coverFilters}
        coverOptions={availableCoverLabels}
        onCoverFilterChange={handleCoverFilterChange}
        coverColor={coverColor}
        onCoverColorChange={handleCoverColorChange}
        canUndo={undoCount > 0}
      />
    </>
  );
}

export default App;
