import os
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS

from scripts.ocr import read_text_from_upload, read_text_boxes
from scripts.face_detection import detect_faces

# --- Paths ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(BASE_DIR, "..", "frontend", "dist")

app = Flask(
    __name__,
    static_folder=FRONTEND_DIST,
    static_url_path=""
)
cors = CORS(app, resources={r"/api/*": {"origins": "*"}})


# --- React static files ---
@app.route("/")
def index():
    # Serve the main React HTML file (built assets expected in dist)
    return send_from_directory(FRONTEND_DIST, "index.html")


@app.route("/<path:path>")
def static_proxy(path):
    """
    Serve JS/CSS/assets from the dist folder.
    If the file doesn't exist, fall back to index.html
    so React Router still works.
    """
    file_path = os.path.join(FRONTEND_DIST, path)
    if os.path.isfile(file_path):
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


# --- API endpoints ---
@app.route("/api/hello")
def hello():
    return jsonify({"message": "Hello from Python backend!"})


@app.route("/api/ocr", methods=["POST"])
def extract_text():
    """
    Accept an uploaded image, run OCR via EasyOCR, and return the detected text.
    """
    if "image" not in request.files:
        return jsonify({"error": "missing-image"}), 400

    upload = request.files["image"]
    result = read_text_from_upload(upload)

    status = result.pop("status", 200 if result.get("ok") else 500)
    return jsonify(result), status


@app.route("/api/ocr/boxes", methods=["POST"])
def extract_text_boxes():
    """
    Accept an uploaded image, run OCR, and return bounding boxes for detected text.
    """
    if "image" not in request.files:
        return jsonify({"error": "missing-image"}), 400

    upload = request.files["image"]
    result = read_text_boxes(upload)

    status = result.pop("status", 200 if result.get("ok") else 500)
    return jsonify(result), status


@app.route("/api/faces", methods=["POST"])
def extract_faces():
    """
    Accept an uploaded image and return bounding boxes for detected faces.
    """
    if "image" not in request.files:
        return jsonify({"error": "missing-image"}), 400

    upload = request.files["image"]
    scale_factor = request.form.get("scale_factor", type=float)
    min_neighbors = request.form.get("min_neighbors", type=int)

    kwargs = {}
    if scale_factor is not None:
        kwargs["scale_factor"] = scale_factor
    if min_neighbors is not None:
        kwargs["min_neighbors"] = min_neighbors

    result = detect_faces(upload, **kwargs)
    status = result.pop("status", 200 if result.get("ok") else 500)
    return jsonify(result), status


def run(host: str = "127.0.0.1", port: int = 5000):
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    # Allow running the Flask server directly: python server.py
    run()
