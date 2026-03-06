# F or G

`F or G` is an iPhone-first Expo app + Python backend that gives a fresh, conservative recommendation on whether to take `F`, `G`, or `?` when there is no signal.

## Repo layout

- `mobile/`: Expo React Native app (TestFlight target)
- `backend/`: FastAPI decision API + debug web page
- `subway_home_router_spec.md`: architecture + v2 decision addendum

## 1) Run backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 2) Run mobile app (Expo)

```bash
cd mobile
cp .env.example .env
npm install
npm run start
```

If testing on physical iPhone, set `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP, e.g. `http://192.168.1.50:8000`.

## 3) Web debug page

Open:

```text
http://localhost:8000/debug
```

## 4) TestFlight build (EAS)

```bash
cd mobile
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Before first release, set a real iOS bundle identifier in `mobile/app.json`.
