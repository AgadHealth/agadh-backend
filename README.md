# Agadh Backend

Express API for Agad Health profiles, file-based medical records, vitals, and patient-doctor access, backed by Supabase Postgres and Storage. Authentication is performed in the Expo app with Supabase Auth; this API validates the bearer access token for protected requests.

## Supabase Setup

1. Create a Supabase project and enable email/password authentication with email confirmation required.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL Editor. It creates profile tables, file-based record tables, vitals, access grants, RLS policies, and the `medical-records` Storage bucket.
3. Configure backend environment variables locally:

```env
PORT=5000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-backend-secret-key
```

`SUPABASE_SERVICE_ROLE_KEY` is accepted as a legacy alternative to `SUPABASE_SECRET_KEY`. Keep either value only in the backend `.env`; never expose it to Expo.

Email OTP screens require the Confirm signup email template to send `{{ .Token }}` rather than only a confirmation link. Phone verification is currently bypassed in the app until SMS delivery is configured.

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
| `POST` | `/api/patient/register` | Create the patient role profile |
| `GET`, `POST` | `/api/patient/vitals` | List or create vitals |
| `GET`, `POST` | `/api/patient/lab-tests` | List or create file-based lab records |
| `GET`, `POST` | `/api/patient/files` | List or create patient file metadata |
| `POST` | `/api/patient/files/upload-url` | Create a signed Storage upload URL and return `file_url` |
| `GET` | `/api/patient/qrcode` | Generate a QR payload for the current patient |
| `POST` | `/api/doctor/register` | Submit doctor professional onboarding |
| `POST` | `/api/access/grant` | Patient grants doctor access |
| `POST` | `/api/access/revoke/:accessId` | Patient revokes doctor access |
| `GET` | `/api/access/my-doctors` | Patient lists doctors with active access |
| `GET` | `/api/access/my-patients` | Doctor lists accessible patients |

Passwords remain in Supabase Auth only. Signup profile payloads contain no medical record data.
