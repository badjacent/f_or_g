# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

F or G is an iPhone app (Expo/React Native) + Python backend that recommends whether to take the F or G subway train at a Brooklyn transfer point where there's no cell signal. It parses MTA GTFS-realtime feeds and applies a decision engine with confidence levels.

## Commands

### Backend (Python/FastAPI)
```bash
cd backend
source .venv/bin/activate        # venv must exist; create with: python3 -m venv .venv
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Backend needs `backend/.env` (copy from `.env.example`). Key vars: `MTA_FEED_URLS`, `MTA_BOARDING_STOP_IDS_F=A41S`, `MTA_BOARDING_STOP_IDS_G=A42S`, `MTA_DESTINATION_STOP_ID=F21S`.

### Mobile (Expo/React Native/TypeScript)
```bash
cd mobile
npm install
npm run start          # Expo dev server
```
Set `EXPO_PUBLIC_API_BASE_URL` to LAN IP for physical device testing. Production fallback: `https://forg.aionyourside.net`.

### No tests exist yet
There are no test suites. CI runs `python3 -m py_compile app/main.py` for backend and `npx tsc --noEmit` for mobile type checking.

## Architecture

### Backend (`backend/app/`)
- **`main.py`**: FastAPI routes (`/health`, `/api/recommendation`, `/debug`) and response formatting
- **`models.py`**: Shared dataclasses (`TripPrediction`, `RouteCandidate`, `FeedSnapshot`, etc.) and enums
- **`feeds/client.py`**: Generic GTFS-RT feed fetcher with per-URL-set caching. Scenario-agnostic — returns all trip updates
- **`engine/decision.py`**: Generic two-candidate comparison engine. `select_candidate()` picks the best trip for a route, `decide()` compares two candidates and determines winner/reason/urgency/confidence
- **`scenarios/base.py`**: `Scenario` protocol defining the interface for decision scenarios
- **`scenarios/f_or_g.py`**: The F-vs-G scenario — extracts F/G predictions and A/C anchor train windows, computes rider-ready times, provides scenario-specific summary text and debug data
- **`lambda_handler.py`**: Wraps the FastAPI app via Mangum for Lambda
- **Adding a new scenario**: Create a new class implementing `Scenario` in `scenarios/`, wire it up in `main.py`
- **Decision engine constants**: Tie-break threshold = 60s, feed freshness max = 60s (env-configurable)
- **F-or-G specifics**: F transfer overhead = 0s, G = 90s. Tie breaks favor F

### Mobile (`mobile/App.tsx` — single-component app)
- Expo SDK 55, React Native 0.83.2, TypeScript strict mode
- Bundle ID: `net.aionyourside.forg`
- Shows recommendation with confidence level and transfer timing
- Pull-to-refresh, hidden debug screen via long-press
- API base URL resolution: env var → localhost (dev) → `https://forg.aionyourside.net` (prod)

### Infrastructure (`infra/terraform/`)
- AWS Lambda + API Gateway v2 (HTTP) + Route53 + ACM
- Domain: `forg.aionyourside.net` under zone `aionyourside.net`
- Remote state: S3 bucket + DynamoDB lock table
- Python 3.11 Lambda runtime, handler: `lambda_handler.handler`

### CI/CD (`.github/workflows/`)
- `ci.yml`: Backend compile check + mobile typecheck on all pushes
- `deploy-lambda.yml`: Auto-deploys backend to Lambda on `main` pushes changing `backend/**`
- `deploy-infra.yml`: Terraform plan/apply on `main` pushes changing `infra/terraform/**`
- All AWS access via GitHub OIDC role assumption

## Key Design Decisions (from `subway_home_router_spec.md`)
- Conservative: recommends `?` (stay on current train) when data is uncertain
- G always gets +90s transfer overhead because rider must walk to a different platform
- The app is designed for offline-first quick glance — open, see recommendation, close
