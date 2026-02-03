import os
import tempfile
from typing import Dict, List, Union

try:
    import cv2
except ImportError:  # pragma: no cover - optional dependency
    cv2 = None


def _save_upload_to_temp(upload):
    if not upload:
        return None
    _, ext = os.path.splitext(upload.filename or "")
    suffix = ext if ext else ".png"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    upload.save(tmp.name)
    return tmp.name


def detect_faces(upload, scale_factor: float = 1.1, min_neighbors: int = 5) -> Dict[str, Union[int, bool, str, List[Dict[str, float]]]]:
    """
    Detect faces in an uploaded image using OpenCV Haar cascades.
    Returns a response dict with keys:
      ok: bool
      status: HTTP-like status code
      boxes: list of bounding boxes (x, y, width, height, category="faces") when ok=True
      error/message: diagnostics when ok=False
    """
    if cv2 is None:
        return {"ok": False, "status": 500, "error": "opencv-not-installed"}

    if not upload:
        return {"ok": False, "status": 400, "error": "missing-image"}

    temp_path = _save_upload_to_temp(upload)
    try:
        if not temp_path:
            return {"ok": False, "status": 400, "error": "missing-image"}

        image = cv2.imread(temp_path)
        if image is None:
            return {"ok": False, "status": 400, "error": "invalid-image"}

        cascade_dir = getattr(cv2.data, "haarcascades", "")
        cascade_path = os.path.join(cascade_dir, "haarcascade_frontalface_default.xml")
        face_cascade = cv2.CascadeClassifier(cascade_path)
        if face_cascade.empty():
            return {"ok": False, "status": 500, "error": "cascade-not-loaded"}

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=float(scale_factor) if scale_factor else 1.1,
            minNeighbors=int(min_neighbors) if min_neighbors else 5,
        )

        boxes = [
            {
                "x": float(x),
                "y": float(y),
                "width": float(w),
                "height": float(h),
                "category": "faces",
            }
            for (x, y, w, h) in faces
        ]

        return {"ok": True, "status": 200, "boxes": boxes}
    except Exception as exc:  # pragma: no cover - runtime guardrail
        return {
            "ok": False,
            "status": 500,
            "error": "face-detection-failed",
            "message": str(exc),
        }
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
