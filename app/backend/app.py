import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from typing import Optional, Tuple

try:
    import webview
except ImportError:  # pragma: no cover - optional dependency
    webview = None

from server import run as run_flask

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "frontend"))


def start_flask_in_thread(host: str, port: int) -> threading.Thread:
    thread = threading.Thread(
        target=run_flask,
        kwargs={"host": host, "port": port},
        daemon=True,
    )
    thread.start()
    return thread


def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        try:
            sock.connect((host, port))
            return True
        except OSError:
            return False


def start_frontend_dev(host: str, port: int) -> Optional[subprocess.Popen]:
    if not os.path.isdir(FRONTEND_DIR):
        print(f"[frontend] Directory not found: {FRONTEND_DIR}")
        return None

    cmd = ["npm", "run", "dev", "--", "--host", host, "--port", str(port), "--strictPort"]
    print(f"[frontend] Starting: {' '.join(cmd)} (cwd={FRONTEND_DIR})")
    try:
        return subprocess.Popen(cmd, cwd=FRONTEND_DIR)
    except FileNotFoundError:
        print("[frontend] npm not found. Please install Node.js and npm.")
    except Exception as exc:  # pragma: no cover - runtime guardrail
        print(f"[frontend] Failed to start dev server: {exc}")
    return None


def wait_for_port(host: str, port: int, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_port_open(host, port):
            return True
        time.sleep(0.5)
    return False


def open_webview(url: str):
    if webview is not None:
        print(f"[webview] Opening {url} in native window...")
        try:
            webview.create_window("Screenshot App", url)
            webview.start()
            return
        except Exception as exc:  # pragma: no cover - runtime guardrail
            print(f"[webview] Failed to open window: {exc}")

    print(f"[webview] Not available. Opening browser at {url}")
    try:
        webbrowser.open(url, new=2)
    except Exception as exc:  # pragma: no cover - runtime guardrail
        print(f"[browser] Failed to open URL automatically: {exc}")


def stop_process(proc: subprocess.Popen, name: str = "process", timeout: float = 5.0):
    if not proc:
        return
    if proc.poll() is not None:
        return
    print(f"[{name}] Stopping...")
    try:
        proc.terminate()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
    except Exception as exc:  # pragma: no cover - runtime guardrail
        print(f"[{name}] Failed to stop: {exc}")


def main() -> int:
    flask_host = os.getenv("FLASK_HOST", "127.0.0.1")
    flask_port = int(os.getenv("FLASK_PORT", "5000"))
    vite_host = os.getenv("VITE_HOST", "localhost")
    vite_port = int(os.getenv("VITE_PORT", "5173"))

    print(f"[backend] Starting Flask on http://{flask_host}:{flask_port}")
    flask_thread = start_flask_in_thread(flask_host, flask_port)

    frontend_proc: Optional[subprocess.Popen] = None
    frontend_running_before = is_port_open(vite_host, vite_port)
    if frontend_running_before:
        print(f"[frontend] Detected existing dev server at http://{vite_host}:{vite_port}, not starting a new one.")
    else:
        frontend_proc = start_frontend_dev(vite_host, vite_port)

    # Wait briefly for servers to come up for a smoother user experience
    if not wait_for_port(flask_host, flask_port, timeout=10):
        print(f"[backend] Warning: Flask not reachable on {flask_host}:{flask_port} yet.")
    if frontend_running_before or frontend_proc:
        if wait_for_port(vite_host, vite_port, timeout=20):
            print(f"[frontend] Dev server reachable at http://{vite_host}:{vite_port}")
        else:
            print(f"[frontend] Warning: Vite not reachable on {vite_host}:{vite_port}. Check npm output above.")

    print("\nApp ready:")
    print(f"  Backend API: http://{flask_host}:{flask_port}")
    print(f"  Frontend UI: http://{vite_host}:{vite_port}\n")
    print("Press Ctrl+C to stop both.")

    # Always open the Vite dev server in the webview.
    window_url = f"http://{vite_host}:{vite_port}"

    exit_code = 0
    try:
        open_webview(window_url)
        while True:
            time.sleep(1)
            if frontend_proc and frontend_proc.poll() is not None:
                print("[frontend] Dev server exited.")
                exit_code = frontend_proc.poll()
                break
            if flask_thread and not flask_thread.is_alive():
                print("[backend] Flask thread exited.")
                exit_code = 1
                break
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        stop_process(frontend_proc, name="frontend")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
