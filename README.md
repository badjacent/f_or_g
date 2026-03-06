# F or G

`F or G` is an iPhone-first Expo app + Python backend that gives a fresh, conservative recommendation on whether to take `F`, `G`, or `?` when there is no signal.

## Repo layout

- `mobile/`: Expo React Native app (TestFlight target)
- `backend/`: FastAPI decision API + debug web page
- `subway_home_router_spec.md`: architecture + v2 decision addendum

## Websites to use

- Expo dashboard: `https://expo.dev` (EAS project/builds)
- Apple Developer portal: `https://developer.apple.com/account` (App ID / bundle ID ownership)
- App Store Connect: `https://appstoreconnect.apple.com` (app record + TestFlight testers)
- GitHub repo settings: `https://github.com/badjacent/f_or_g/settings/secrets/actions` (Actions secrets)
- AWS Lambda console: `https://console.aws.amazon.com/lambda/home` (function runtime/env/handler)
- AWS API Gateway console: `https://console.aws.amazon.com/apigateway/main/apis` (public HTTPS endpoint, if using API Gateway)

## 1) Run backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Required backend config (`backend/.env`):

- `MTA_FEED_URLS` must include both feeds for coverage:
  - `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm`
  - `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g`
- `MTA_BOARDING_STOP_IDS_F=A41S`
- `MTA_BOARDING_STOP_IDS_G=A42S`
- `MTA_DESTINATION_STOP_ID=F21S`
- `MTA_API_KEY` optional (leave blank unless needed)

## 2) Run mobile app (Expo)

```bash
cd mobile
cp .env.example .env
npm install
npm run start
```

If testing on physical iPhone, set `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP, e.g. `http://192.168.1.50:8000`.

For production/TestFlight builds, set `EXPO_PUBLIC_API_BASE_URL` to your deployed backend HTTPS URL.

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

App identity setup (exact places):

1. Pick bundle ID string (example: `com.badjacent.forg`).
2. Put it in [`mobile/app.json`](/Users/michaelhollander/github/f_or_g/mobile/app.json) as `expo.ios.bundleIdentifier`.
3. In Apple Developer portal (`https://developer.apple.com/account`) create/register the App ID using that same bundle ID.
4. In App Store Connect (`https://appstoreconnect.apple.com`) create the app record with the same bundle ID.

Manual TestFlight flow (recommended):

1. Build iOS:
```bash
cd mobile
eas build --platform ios --profile production
```
2. Submit to TestFlight:
```bash
eas submit --platform ios --profile production
```
3. In App Store Connect (`https://appstoreconnect.apple.com`) -> TestFlight:
- add internal testers
- optionally submit for external testing review

## 5) Lambda auto-deploy (GitHub Actions)

On every push to `main` that changes `backend/**`, GitHub Actions deploys the backend package to Lambda.

Set this repository secret:

- `AWS_ROLE_TO_ASSUME`: IAM role ARN for GitHub OIDC deploy

Optional secret:

- `MTA_API_KEY`: only if MTA key is needed later

Lambda handler entrypoint is `lambda_handler.handler` from `backend/lambda_handler.py`.

Required Lambda runtime config:

- Runtime: Python 3.11
- Handler: `lambda_handler.handler`
- Environment variables should match `backend/.env`

## 6) Terraform Infra (Route53 + API Gateway + Lambda)

Terraform config is in [`infra/terraform`](/Users/michaelhollander/github/f_or_g/infra/terraform).

Defaults are pre-set for your domain:

- Route53 zone: `aionyourside.net`
- API domain: `forg.aionyourside.net`
- Lambda function name: `f-or-g-backend`

Local apply:

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

CI apply:

- Workflow: `.github/workflows/deploy-infra.yml`
- Triggers on pushes to `main` touching `infra/terraform/**`
- Uses GitHub OIDC role (`AWS_ROLE_TO_ASSUME`)

IAM trust policy for `AWS_ROLE_TO_ASSUME` (copy/paste):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:badjacent/f_or_g:ref:refs/heads/main",
            "repo:badjacent/f_or_g:workflow_dispatch"
          ]
        }
      }
    }
  ]
}
```

Replace `<AWS_ACCOUNT_ID>` with your account ID.

After apply, confirm:

- `https://forg.aionyourside.net/health`
- `https://forg.aionyourside.net/api/recommendation`

## 7) App API Base URL

The app uses this order:

1. `EXPO_PUBLIC_API_BASE_URL` (if set at build/runtime)
2. `http://localhost:8000` in dev (`__DEV__`)
3. `https://forg.aionyourside.net` in production fallback

For EAS production builds, explicitly set:

```bash
cd mobile
eas env:create --name EXPO_PUBLIC_API_BASE_URL --value https://forg.aionyourside.net --environment production
```
