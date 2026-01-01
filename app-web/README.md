# app-web

## Environment

- `API_BASE_URL` must point to the app-api base URL (no trailing slash).
  - Local: `API_BASE_URL=http://localhost:4000`
  - Vercel: set `API_BASE_URL` in the Project Environment Variables to your backend domain.
- The frontend calls only `/api/*` routes; do not use `NEXT_PUBLIC_API_BASE_URL` on the client.
