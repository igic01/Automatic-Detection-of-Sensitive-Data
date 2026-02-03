from __future__ import annotations

import ast
import os
import sys
import urllib.request
from typing import Callable, Iterable, Optional, Tuple

import cv2
import numpy as np


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


def _gaussian_psf(ksize: int, sigma: float) -> np.ndarray:
    ax = np.arange(-(ksize // 2), ksize // 2 + 1, dtype=np.float32)
    xx, yy = np.meshgrid(ax, ax)
    psf = np.exp(-(xx**2 + yy**2) / (2.0 * sigma**2))
    psf /= np.sum(psf)
    return psf


def _wiener_deconvolution(img: np.ndarray, psf: np.ndarray, balance: float) -> np.ndarray:
    img_f = img.astype(np.float32)
    psf_f = psf.astype(np.float32)
    psf_pad = np.zeros_like(img_f)
    kh, kw = psf_f.shape
    psf_pad[:kh, :kw] = psf_f
    psf_pad = np.roll(psf_pad, -kh // 2, axis=0)
    psf_pad = np.roll(psf_pad, -kw // 2, axis=1)

    img_fft = np.fft.fft2(img_f)
    psf_fft = np.fft.fft2(psf_pad)
    psf_fft_conj = np.conj(psf_fft)
    denom = (np.abs(psf_fft) ** 2) + balance
    result = np.fft.ifft2(img_fft * psf_fft_conj / denom)
    return np.clip(np.real(result), 0.0, 1.0)


def _richardson_lucy(img: np.ndarray, psf: np.ndarray, iterations: int) -> np.ndarray:
    img_f = img.astype(np.float32)
    estimate = np.full_like(img_f, 0.5, dtype=np.float32)
    psf_flip = psf[::-1, ::-1].astype(np.float32)

    for _ in range(iterations):
        conv = cv2.filter2D(estimate, -1, psf, borderType=cv2.BORDER_REFLECT)
        conv = np.maximum(conv, 1e-6)
        relative_blur = img_f / conv
        estimate *= cv2.filter2D(relative_blur, -1, psf_flip, borderType=cv2.BORDER_REFLECT)
        estimate = np.clip(estimate, 0.0, 1.0)

    return estimate


def _unsharp_mask(img: np.ndarray, amount: float, radius: float) -> np.ndarray:
    k = int(max(3, (radius * 4) // 2 * 2 + 1))
    blurred = cv2.GaussianBlur(img, (k, k), radius)
    sharpened = img + amount * (img - blurred)
    return np.clip(sharpened, 0.0, 1.0)


def _sharpness_score(img: np.ndarray) -> float:
    img_8 = (img * 255.0).astype(np.uint8)
    lap = cv2.Laplacian(img_8, cv2.CV_64F)
    return float(lap.var())


def _try_candidates(
    img: np.ndarray,
    candidates: Iterable[Tuple[str, Callable[[], np.ndarray]]],
) -> Tuple[str, np.ndarray]:
    best_name = ""
    best_img = img
    best_score = _sharpness_score(img)

    for name, fn in candidates:
        out = fn()
        score = _sharpness_score(out)
        if score > best_score:
            best_name = name
            best_img = out
            best_score = score

    return best_name or "input", best_img


def _try_gfpgan_restore(
    image: np.ndarray,
    model_path: Optional[str],
    strict: bool,
) -> Optional[np.ndarray]:
    try:
        from gfpgan import GFPGANer
    except Exception as exc:  # pragma: no cover - optional dependency
        if strict:
            raise RuntimeError(
                "GFPGAN import failed. Ensure gfpgan is installed and dependencies are compatible."
            ) from exc
        return None

    if not model_path:
        model_path = os.path.join(os.path.dirname(__file__), "models", "GFPGANv1.4.pth")
    model_path = _ensure_gfpgan_model(model_path, strict)
    if model_path is None:
        return None

    restorer = GFPGANer(
        model_path=model_path,
        upscale=1,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=None,
    )
    _, _, restored = restorer.enhance(
        image,
        has_aligned=False,
        only_center_face=False,
        paste_back=True,
    )
    return restored


def _download_file(url: str, dst_path: str) -> None:
    tmp_path = dst_path + ".tmp"
    with urllib.request.urlopen(url) as response, open(tmp_path, "wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    os.replace(tmp_path, dst_path)


def _ensure_gfpgan_model(model_path: str, strict: bool) -> Optional[str]:
    if os.path.isfile(model_path):
        return model_path

    url = os.environ.get(
        "GFPGAN_MODEL_URL",
        "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.8/GFPGANv1.4.pth",
    )
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    try:
        _download_file(url, model_path)
        return model_path if os.path.isfile(model_path) else None
    except Exception as exc:
        if strict:
            raise RuntimeError(
                "GFPGAN model download failed. Set GFPGAN_MODEL to a local file or GFPGAN_MODEL_URL to a direct link."
            ) from exc
        return None


def recover_blurred_region(
    image_path: str,
    rect: Tuple[int, int, int, int],
    method: str = "auto",
) -> str:
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

    h, w = image.shape[:2]
    x, y, rw, rh = _clamp_rect(*rect, width=w, height=h)

    base, ext = os.path.splitext(image_path)
    out_path = f"{base}_recovered{ext or '.jpg'}"

    roi = image[y : y + rh, x : x + rw]
    ycrcb = cv2.cvtColor(roi, cv2.COLOR_BGR2YCrCb).astype(np.float32)
    y_chan = ycrcb[:, :, 0] / 255.0

    method = method.lower().strip()
    if method in {"auto", "face", "gfpgan"}:
        restored_full = _try_gfpgan_restore(
            image,
            os.environ.get("GFPGAN_MODEL"),
            strict=method in {"face", "gfpgan"},
        )
        if restored_full is not None:
            image[y : y + rh, x : x + rw] = restored_full[y : y + rh, x : x + rw]
            cv2.imwrite(out_path, image)
            return out_path

    if method == "auto":
        candidates = []
        for k in (3, 5, 7, 9, 11):
            sigma = max(0.6, k / 3.0)
            psf = _gaussian_psf(k, sigma)
            candidates.append((f"wiener_k{k}", lambda p=psf: _wiener_deconvolution(y_chan, p, 0.01)))
        for k in (3, 5, 7, 9):
            sigma = max(0.6, k / 3.0)
            psf = _gaussian_psf(k, sigma)
            for iters in (15, 25):
                candidates.append(
                    (f"rl_k{k}_i{iters}", lambda p=psf, i=iters: _richardson_lucy(y_chan, p, i))
                )
        candidates.append(("unsharp", lambda: _unsharp_mask(y_chan, amount=1.2, radius=1.3)))
        _, best = _try_candidates(y_chan, candidates)
        recovered = best
    elif method == "wiener":
        psf = _gaussian_psf(7, 2.2)
        recovered = _wiener_deconvolution(y_chan, psf, 0.01)
    elif method in {"rl", "richardson"}:
        psf = _gaussian_psf(7, 2.2)
        recovered = _richardson_lucy(y_chan, psf, 25)
    elif method == "unsharp":
        recovered = _unsharp_mask(y_chan, amount=1.2, radius=1.3)
    else:
        raise ValueError("method must be auto, face, gfpgan, wiener, rl, or unsharp")

    ycrcb[:, :, 0] = recovered * 255.0
    out_roi = cv2.cvtColor(ycrcb.astype(np.uint8), cv2.COLOR_YCrCb2BGR)
    image[y : y + rh, x : x + rw] = out_roi

    cv2.imwrite(out_path, image)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(
            "Usage: python recover_blur.py image.jpg \"(x, y, w, h)\" [auto|face|gfpgan|wiener|rl|unsharp]"
        )

    image_path = sys.argv[1]
    rect = _parse_rect(" ".join(sys.argv[2:-1]) if len(sys.argv) > 3 else sys.argv[2])
    method = sys.argv[-1] if len(sys.argv) > 3 else "auto"
    out = recover_blurred_region(image_path, rect, method)
    print(out)
