# Backend (Python)

FastAPI service that fetches MTA GTFS-RT data, computes an `F`/`G`/`?` recommendation, and exposes:

- `GET /api/recommendation`
- `GET /health`
- `GET /debug` (simple web debug page)

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

`MTA_API_KEY` is optional. `.env.example` is prewired with your brooklyn-bound setup:

- `MTA_FEED_URLS=...gtfs-bdfm,...gtfs-g`
- `MTA_BOARDING_STOP_IDS_F=A41S`
- `MTA_BOARDING_STOP_IDS_G=A42S`
- `MTA_DESTINATION_STOP_ID=F21S`

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
