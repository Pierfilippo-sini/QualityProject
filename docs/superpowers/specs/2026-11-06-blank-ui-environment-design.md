# Blank UI Environment Design Spec

## Intent & Why
Provide an isolated, blank white workspace at `/ui` for future development of the "brain" UI, accessible via password `Definitiva` on the existing `/login` page, without modifying or overwriting any existing B2B dashboard functionality.

## Goals
- Add environment variable `BRAIN_GATE_SECRET="Definitiva"`.
- Support dual password verification in `/api/auth/session`:
  - `SalesPass2026!X` (existing `ACCESS_GATE_SECRET`) authenticates and redirects to `/` (existing dashboard).
  - `Definitiva` (`BRAIN_GATE_SECRET`) authenticates and redirects to `/ui` (new blank canvas).
- Protect `/ui` with session verification via `middleware.ts`.
- Create `/ui` page (`app/ui/page.tsx`) with a clean, blank white interface (`min-h-screen bg-white`).
- Preserve all existing routes, components, and authentication behavior without breaking changes.

## Non-Goals
- Changing the existing B2B dashboard UI or logic.
- Building the brain UI itself (reserved for future work by the user).
- Modifying how existing session cookies are named (`scout_session_token`).
