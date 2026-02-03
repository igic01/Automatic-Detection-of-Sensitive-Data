import os
import tempfile
import threading
import warnings
from typing import Dict, List, Union
from . import myregex

try:
    import easyocr
except ImportError:
    easyocr = None

_reader_lock = threading.Lock()
_reader = None


ENTITY_TYPES = ("iban", "email", "phone", "date")
CATEGORY_MAP = {
    "iban": "iban",
    "email": "emails",
    "phone": "phone-numbers",
    "date": "date",
}
CANDIDATE_MIN_SCORE = {
    "date": 0.5,
    "iban": 0.5,
    "phone": 0.6,
    "email": 0.5,
}


def _get_reader():
    """
    Lazily instantiate the EasyOCR reader once, guarded by a lock.
    GPU is disabled to avoid extra setup requirements.
    """
    global _reader
    if _reader is None and easyocr is not None:
        with _reader_lock:
            if _reader is None:
                with warnings.catch_warnings():
                    warnings.filterwarnings(
                        "ignore",
                        message=".*pin_memory.*",
                        category=UserWarning,
                    )
                    _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _reader


def _save_upload_to_temp(upload):
    if not upload:
        return None
    _, ext = os.path.splitext(upload.filename or "")
    suffix = ext if ext else ".png"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    upload.save(tmp.name)
    return tmp.name


def _bbox_metrics(bbox):
    xs = [pt[0] for pt in bbox]
    ys = [pt[1] for pt in bbox]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    height = max_y - min_y
    return {
        "min_x": min_x,
        "max_x": max_x,
        "min_y": min_y,
        "max_y": max_y,
        "height": height,
    }


def _overlap_ratio(line_box, item_box):
    overlap = max(0.0, min(line_box["max_y"], item_box["max_y"]) - max(line_box["min_y"], item_box["min_y"]))
    denom = min(line_box["height"], item_box["height"]) or 1.0
    return overlap / denom


def _group_items_into_lines(items, y_overlap_thresh=0.5):
    lines = []
    for item in sorted(items, key=lambda it: (it["box"]["min_y"], it["box"]["min_x"])):
        matched = None
        best_ratio = 0.0
        for line in lines:
            ratio = _overlap_ratio(line["box"], item["box"])
            if ratio > best_ratio:
                best_ratio = ratio
                matched = line
        if matched and best_ratio >= y_overlap_thresh:
            matched["items"].append(item)
            matched["box"]["min_y"] = min(matched["box"]["min_y"], item["box"]["min_y"])
            matched["box"]["max_y"] = max(matched["box"]["max_y"], item["box"]["max_y"])
            matched["box"]["height"] = matched["box"]["max_y"] - matched["box"]["min_y"]
            matched["box"]["min_x"] = min(matched["box"]["min_x"], item["box"]["min_x"])
            matched["box"]["max_x"] = max(matched["box"]["max_x"], item["box"]["max_x"])
        else:
            lines.append({"items": [item], "box": dict(item["box"])})

    for line in lines:
        line["items"].sort(key=lambda it: it["box"]["min_x"])

    lines.sort(key=lambda ln: (ln["box"]["min_y"], ln["box"]["min_x"]))
    return lines


def _line_text_and_offsets(tokens):
    parts = []
    offsets = []
    pos = 0
    for idx, token in enumerate(tokens):
        if parts:
            parts.append(" ")
            pos += 1
        start = pos
        text = token["text"]
        parts.append(text)
        pos += len(text)
        offsets.append((start, pos, idx))
    return "".join(parts), offsets


def _token_indices_for_span(offsets, start, end):
    indices = []
    for token_start, token_end, idx in offsets:
        if token_end > start and token_start < end:
            indices.append(idx)
    return indices


def _merge_boxes(tokens):
    min_x = min(token["box"]["min_x"] for token in tokens)
    min_y = min(token["box"]["min_y"] for token in tokens)
    max_x = max(token["box"]["max_x"] for token in tokens)
    max_y = max(token["box"]["max_y"] for token in tokens)
    return {"min_x": min_x, "min_y": min_y, "max_x": max_x, "max_y": max_y}


def _dedupe_results(results):
    seen = set()
    unique = []
    for result in results:
        box = result["box"]
        key = (
            result["value"],
            round(box["min_x"], 1),
            round(box["min_y"], 1),
            round(box["max_x"], 1),
            round(box["max_y"], 1),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(result)
    return unique


def _locate_entities_in_lines(lines, entity_type, min_score=None, require_valid=False):
    results = []
    for line in lines:
        tokens = line["items"]
        line_text, offsets = _line_text_and_offsets(tokens)
        matches = myregex.find_matches_for_type(line_text, entity_type)
        for match in matches:
            value = match["normalized"]
            is_match, score = myregex.score_entity(entity_type, value)
            if min_score is not None and score < min_score:
                continue
            if require_valid and not myregex.is_valid_entity(entity_type, value):
                continue
            start, end = match["span"]
            token_indices = _token_indices_for_span(offsets, start, end)
            if not token_indices:
                continue
            selected = [tokens[idx] for idx in token_indices]
            box = _merge_boxes(selected)
            conf = sum(item["conf"] for item in selected) / len(selected)
            results.append(
                {
                    "value": value,
                    "raw": match["raw"],
                    "box": box,
                    "conf": conf,
                    "score": score,
                    "match": is_match,
                    "type": entity_type,
                }
            )
    results = _dedupe_results(results)
    results.sort(key=lambda item: (item["box"]["min_y"], item["box"]["min_x"]))
    return results


def _load_reader_or_error():
    reader = _get_reader()
    if reader is None:
        return {"ok": False, "status": 500, "error": "easyocr-not-initialized"}
    return reader


def read_text_from_upload(upload) -> Dict[str, Union[int, bool, str, List[str]]]:
    """
    Run OCR on an uploaded file-like object (Flask FileStorage).
    Returns a response dict with keys:
      ok: bool
      status: HTTP-like status code
      text: combined text (when ok=True)
      lines: list of detected lines (when ok=True)
      error/message: diagnostics (when ok=False)
    """
    if easyocr is None:
        return {"ok": False, "status": 500, "error": "easyocr-not-installed"}

    if not upload:
        return {"ok": False, "status": 400, "error": "missing-image"}

    if upload.filename == "":
        return {"ok": False, "status": 400, "error": "empty-image"}

    temp_path = _save_upload_to_temp(upload)
    try:
        if not temp_path:
            return {"ok": False, "status": 400, "error": "missing-image"}

        reader = _load_reader_or_error()
        if not isinstance(reader, easyocr.Reader):
            return reader

        with _reader_lock:
            detected_lines: List[str] = reader.readtext(temp_path, detail=0)

        text = "\n".join(line.strip() for line in detected_lines if str(line).strip())
        return {
            "ok": True,
            "status": 200,
            "text": text,
            "lines": detected_lines,
        }
    except Exception as exc:  # pragma: no cover - runtime guardrail
        return {
            "ok": False,
            "status": 500,
            "error": "ocr-failed",
            "message": str(exc),
        }
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


def read_text_boxes(upload) -> Dict[str, Union[int, bool, str, List[Dict[str, Union[str, float]]]]]:
    """
    Run OCR and return bounding boxes with text and confidence.
    Each box is described by x, y, width, height in image pixel space.
    Boxes are classified into categories (date, iban, phone-numbers, emails) via regex.
    Unclassified detections are omitted.
    """
    if easyocr is None:
        return {"ok": False, "status": 500, "error": "easyocr-not-installed"}

    if not upload:
        return {"ok": False, "status": 400, "error": "missing-image"}

    temp_path = _save_upload_to_temp(upload)
    try:
        if not temp_path:
            return {"ok": False, "status": 400, "error": "missing-image"}

        reader = _load_reader_or_error()
        if not isinstance(reader, easyocr.Reader):
            return reader

        with _reader_lock:
            detections = reader.readtext(temp_path, detail=1)

        items = []
        for det in detections:
            if not det or len(det) < 2:
                continue
            coords, text = det[0], det[1]
            conf = det[2] if len(det) > 2 else None
            cleaned = str(text).strip() if text is not None else ""
            if not cleaned:
                continue
            if not coords or len(coords) < 4:
                continue
            items.append(
                {
                    "text": cleaned,
                    "conf": float(conf) if conf is not None else 0.0,
                    "box": _bbox_metrics(coords),
                }
            )

        lines = _group_items_into_lines(items, y_overlap_thresh=0.5)
        results = []
        for entity_type in ENTITY_TYPES:
            results.extend(
                _locate_entities_in_lines(
                    lines,
                    entity_type,
                    min_score=CANDIDATE_MIN_SCORE.get(entity_type),
                    require_valid=False,
                )
            )

        boxes = []
        for result in results:
            box = result["box"]
            width = max(0.0, box["max_x"] - box["min_x"])
            height = max(0.0, box["max_y"] - box["min_y"])
            boxes.append(
                {
                    "x": float(box["min_x"]),
                    "y": float(box["min_y"]),
                    "width": float(width),
                    "height": float(height),
                    "text": result["value"],
                    "confidence": float(result["conf"]),
                    "category": CATEGORY_MAP[result["type"]],
                }
            )

        return {"ok": True, "status": 200, "boxes": boxes}
    except Exception as exc:  # pragma: no cover - runtime guardrail
        return {
            "ok": False,
            "status": 500,
            "error": "ocr-boxes-failed",
            "message": str(exc),
        }
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
