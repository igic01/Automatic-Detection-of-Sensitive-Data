# App

React (Vite) frontend + Flask backend with OCR and face detection endpoints.

## Prerequisites
- Python 3.x
- Node.js + npm

## Setup
### Backend
```powershell
cd app\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend
```powershell
cd app\frontend
npm install
```

## Run (development)
### Option A: One command (starts backend + Vite)
From `app` with the backend venv active:
```powershell
cd app
python backend\app.py
```
This starts Flask on `127.0.0.1:5000` and Vite on `localhost:5173`.

### Option B: Separate terminals
Backend (with venv active):
```powershell
cd app\backend
python server.py
```
Frontend:
```powershell
cd app\frontend
npm run dev
```

### Option C: Windows helper
This starts both in the background and writes logs to `app\dev_logs`:
```powershell
cd app
python run_web.py
```

## Build + run (production-like)
```powershell
cd app\frontend
npm run build
cd ..\backend
python server.py
```
Then open: `http://127.0.0.1:5000`

## Configuration
You can override ports and hosts with environment variables:
- `FLASK_HOST` (default `127.0.0.1`)
- `FLASK_PORT` (default `5000`)
- `VITE_HOST` (default `localhost`)
- `VITE_PORT` (default `5173`)

## Notes
- `backend/server.py` serves the built frontend from `frontend/dist`.
- `backend/app.py` starts Flask and Vite together and opens a webview if available.
