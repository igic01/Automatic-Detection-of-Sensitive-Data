from __future__ import annotations

import ast
import os
import sys
from typing import Tuple

import cv2


def _parse_rect(text: str) -> Tuple[int, int, int, int]:
    rect = ast.literal_eval(text)
    if not (isinstance(rect, (tuple, list)) and len(rect) == 4):
        raise ValueError("rect must be a 4-item tuple/list like (x, y, w, h)")
    x, y, w, h = rect
    return int(x), int(y), int(w), int(h)


def _clamp_rect(x: int, y: int, w: int, h: int, width: int, height: int) -> Tuple[int, int, int, int]:
    x = max(0, min(x, width - 1))
    y = max(0, min(y, height - 1))
    w = max(1, min(w, width - x))
    h = max(1, min(h, height - y))
    return x, y, w, h


def _blur_region(image, rect: Tuple[int, int, int, int], strength: float) -> None:
    x, y, w, h = rect
    base_k = max(3, (min(w, h) // 6) | 1)
    k = max(3, int(round(base_k * strength)))
    if k % 2 == 0:
        k += 1
    roi = image[y : y + h, x : x + w]
    image[y : y + h, x : x + w] = cv2.GaussianBlur(roi, (k, k), 0)


def cover_region(image_path: str, rect: Tuple[int, int, int, int], strength: float = 1.0) -> str:
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

    height, width = image.shape[:2]
    rect = _clamp_rect(*rect, width=width, height=height)

    _blur_region(image, rect, strength)

    base, ext = os.path.splitext(image_path)
    out_path = f"{base}_blur{ext or '.jpg'}"
    cv2.imwrite(out_path, image)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python blur.py image.jpg \"(x, y, w, h)\" [strength]")

    image_path = sys.argv[1]
    args = sys.argv[2:]
    rect_text = " ".join(args).strip()
    strength = 1.0
    if len(args) >= 2:
        try:
            strength = float(args[-1])
            if strength <= 0:
                raise ValueError
            rect_text = " ".join(args[:-1]).strip()
        except ValueError:
            strength = 1.0
    rect = _parse_rect(rect_text)
    out = cover_region(image_path, rect, strength)
    print(out)
