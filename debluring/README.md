# Debluring Demo

![Original](./austriaPJ.jpg)
![Blurred](./austriaPJ_blur.jpg)
![Recovered (face)](./austriaPJ_recovered.jpg)
![Recovered (auto)](./austriaPJ_recovered_auto.jpg)

## What Each File Does

- `blur.py`: Blurs a rectangular region in an image. Optional strength number at the end controls blur intensity.
- `recover_blur.py`: Attempts to recover sharpness inside a rectangular region. Supports `auto`, `face`/`gfpgan`, `wiener`, `rl`, and `unsharp`.
- `get_face_position.py`: Finds the biggest face in an image using OpenCV Haar cascades and returns `(x, y, w, h)`.
- `requirments.txt`: Frozen Python packages for the working environment.
- `models/`: Expected location for `GFPGANv1.4.pth` model file.
- `gfpgan/weights/`: Face detection/parsing weights used by GFPGAN.
- `venv/`: Local virtual environment (not required for usage if you have your own).

## Debluring Logic (Face Method)

When you pass `face` (or `gfpgan`), the script:

1. Tries to load GFPGAN.
2. Loads the model from `models/GFPGANv1.4.pth` (or `GFPGAN_MODEL` env var).
3. Runs GFPGAN on the full image to restore faces.
4. Pastes only the requested rectangle back into the original image.
5. Writes an output file with `_recovered` added to the filename.

This path is best for faces because GFPGAN is trained to restore facial details.

## Debluring Logic (Auto Method)

When you pass `auto`, the script:

1. First tries GFPGAN if it is available (same as the face path above).
2. If GFPGAN is not available, it switches to classic deblurring on the ROI:
   - Converts the ROI to YCrCb and works only on the Y (luma) channel.
   - Tries multiple candidates:
     - Wiener deconvolution with several kernel sizes.
     - Richardson-Lucy deconvolution with several kernel sizes and iteration counts.
     - Unsharp mask as a lightweight sharpen step.
   - Scores each candidate using Laplacian variance (sharpness metric).
   - Picks the sharpest result and writes it back to the ROI.
3. Saves the final image as `<name>_recovered.jpg`.

Auto is useful when you do not know the best method ahead of time.

## Quick Usage

Blur:
```
python blur.py image.jpg "(x, y, w, h)" [strength]
```

Recover:
```
python recover_blur.py image.jpg "(x, y, w, h)" [auto|face|gfpgan|wiener|rl|unsharp]
```

Find face region:
```
python get_face_position.py image.jpg
```

## Setup

1. Create and activate a virtual environment (optional but recommended).
2. Install dependencies:
```
pip install -r requirments.txt
```
3. For `face`/`gfpgan` recovery, place the model file at `models/GFPGANv1.4.pth` or set `GFPGAN_MODEL` to its full path.
