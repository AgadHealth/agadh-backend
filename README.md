# Agadh Backend

Express API for Agad Health profiles and patient records, backed by Supabase Postgres and Storage. Authentication is performed in the Expo app with Supabase Auth; this API validates the bearer access token for protected requests.

## Supabase Setup

1. Create a Supabase project and enable email/password authentication with email confirmation required.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL Editor. It creates profile/record tables, RLS policies, and the private `medical-records` Storage bucket.
3. Configure backend environment variables locally:

```env
PORT=5000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-backend-secret-key
```

`SUPABASE_SERVICE_ROLE_KEY` is accepted as a legacy alternative to `SUPABASE_SECRET_KEY`. Keep either value only in the backend `.env`; never expose it to Expo.

Email OTP screens require the Confirm signup email template to send `{{ .Token }}` rather than only a confirmation link. Phone verification calls Supabase Auth phone-change OTP and requires enabling Phone Auth plus an SMS provider in the Supabase dashboard.

## Run

```bash
npm install
npm run dev
```

Native Expo requests are not browser-CORS restricted. For Expo Web or hosted browser clients, optionally set `FRONTEND_URLS` to a comma-separated origin allowlist; local development defaults to accepting origins.

## Authenticated API

Send `Authorization: Bearer <supabase-access-token>` on all `/api/*` requests.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Server health check |
| `PUT` | `/api/user/profile` | Create or update shared profile details |
| `GET` | `/api/user/me` | Load current profile and role onboarding |
| `POST` | `/api/patient/register` | Create the patient role profile after verification |
| `GET`, `POST` | `/api/patient/vitals` | List or create vitals |
| `GET`, `POST` | `/api/patient/prescriptions` | List or create prescription metadata |
| `GET`, `POST` | `/api/patient/lab-tests` | List or create lab-test metadata |
| `GET`, `POST` | `/api/patient/files` | List or create stored-file metadata |
| `POST` | `/api/patient/files/upload-url` | Create a signed Storage upload URL |
| `GET` | `/api/patient/qrcode` | Generate a QR payload for the current patient |
| `POST` | `/api/doctor/register` | Submit doctor professional onboarding |

Passwords remain in Supabase Auth only. Signup profile payloads contain no prescriptions, lab tests, vitals, or report files.
