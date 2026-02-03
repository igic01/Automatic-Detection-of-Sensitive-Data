import os
import json
import subprocess
import sys
import signal
from shutil import which


def _ensure_path(path, label):
    if not os.path.exists(path):
        raise FileNotFoundError(f"{label} not found: {path}")


def _terminate_pid(pid):
    if not pid:
        return
    try:
        os.kill(pid, signal.SIGTERM)
        return
    except Exception:
        pass
    try:
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception:
        pass


def _collect_listening_pids(port):
    try:
        output = subprocess.check_output(
            ["netstat", "-ano", "-p", "tcp"],
            text=True,
            errors="ignore",
        )
    except Exception:
        return set()

    port_str = str(port)
    pids = set()
    for line in output.splitlines():
        line = line.strip()
        if not line or "LISTENING" not in line:
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
        local_addr = parts[1]
        state = parts[3]
        pid = parts[4]
        if state != "LISTENING":
            continue
        if local_addr.rsplit(":", 1)[-1] != port_str:
            continue
        try:
            pids.add(int(pid))
        except ValueError:
            continue
    return pids


def _kill_port(port):
    for pid in _collect_listening_pids(port):
        _terminate_pid(pid)


def _stop_previous(root, frontend_port):
    pid_path = os.path.join(root, "dev_pids.json")
    if not os.path.exists(pid_path):
        _kill_port(frontend_port)
        return
    try:
        with open(pid_path, "r", encoding="utf-8") as handle:
            data = json.load(handle) or {}
    except Exception:
        return

    for key in ("backend", "frontend"):
        _terminate_pid(data.get(key))

    _kill_port(frontend_port)

    try:
        os.remove(pid_path)
    except OSError:
        pass


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    backend_path = os.path.join(root, "backend")
    frontend_path = os.path.join(root, "frontend")
    venv_python = os.path.join(backend_path, "venv", "Scripts", "python.exe")
    npm_exe = which("npm.cmd") or which("npm")

    _ensure_path(backend_path, "Backend folder")
    _ensure_path(frontend_path, "Frontend folder")
    _ensure_path(venv_python, "Backend venv python")
    if not npm_exe:
        raise FileNotFoundError("npm executable not found on PATH")

    if os.name != "nt":
        print("This helper currently targets Windows only.", file=sys.stderr)
        return 1

    frontend_port = int(os.environ.get("FRONTEND_PORT", "5173"))

    _stop_previous(root, frontend_port)

    logs_dir = os.path.join(root, "dev_logs")
    os.makedirs(logs_dir, exist_ok=True)
    backend_log_path = os.path.join(logs_dir, "backend.log")
    frontend_log_path = os.path.join(logs_dir, "frontend.log")

    creationflags = 0
    if hasattr(subprocess, "CREATE_NO_WINDOW"):
        creationflags |= subprocess.CREATE_NO_WINDOW

    with open(backend_log_path, "a", encoding="utf-8") as backend_log, open(
        frontend_log_path, "a", encoding="utf-8"
    ) as frontend_log:
        backend_proc = subprocess.Popen(
            [venv_python, "server.py"],
            cwd=backend_path,
            stdout=backend_log,
            stderr=backend_log,
            creationflags=creationflags,
        )
        frontend_proc = subprocess.Popen(
            [npm_exe, "run", "dev"],
            cwd=frontend_path,
            stdout=frontend_log,
            stderr=frontend_log,
            creationflags=creationflags,
        )

    pid_path = os.path.join(root, "dev_pids.json")
    with open(pid_path, "w", encoding="utf-8") as handle:
        json.dump(
            {"backend": backend_proc.pid, "frontend": frontend_proc.pid},
            handle,
            indent=2,
        )

    print("Started backend and frontend in the background (tied to this process).")
    print(f"Logs: {backend_log_path} and {frontend_log_path}")
    print(f"PIDs saved to: {pid_path}")
    print("Press Enter to stop both.")

    try:
        input()
    except KeyboardInterrupt:
        print("\nStopping backend and frontend...")
    finally:
        for proc in (backend_proc, frontend_proc):
            if proc.poll() is None:
                _terminate_pid(proc.pid)
        for proc in (backend_proc, frontend_proc):
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    _terminate_pid(proc.pid)
                except Exception:
                    pass

        _kill_port(frontend_port)

        try:
            os.remove(pid_path)
        except OSError:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
