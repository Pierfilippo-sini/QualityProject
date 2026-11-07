# Blank UI Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an isolated blank white page at `/ui` accessible with password `Definitiva` via `/login`, keeping existing dashboard access via `SalesPass2026!X` completely unchanged.

**Architecture:** Dual-secret credential verification in `/api/auth/session` with dynamic redirection, backwards-compatible HMAC session verification in `lib/auth.ts` and `middleware.ts`, and a standalone blank page at `app/ui/page.tsx`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Web Crypto API (HMAC-SHA256).

**Spec:** `docs/superpowers/specs/2026-11-06-blank-ui-environment-design.md`

## Global Constraints
- Preserve all existing files, passwords, and routes without breaking changes or overwriting existing dashboard behavior.
- Old password `SalesPass2026!X` (`ACCESS_GATE_SECRET`) must continue to redirect to `/`.
- New password `Definitiva` (`BRAIN_GATE_SECRET`) must redirect to `/ui`.
- Page at `/ui` must be completely blank white (`bg-white min-h-screen`).
- Unauthenticated access to `/ui` must redirect to `/login`.

## Review Focus
1. Password `SalesPass2026!X` entered on `/login` must still grant access and redirect to `/`.
2. Password `Definitiva` entered on `/login` must grant access and redirect to `/ui`.
3. An invalid password must still return 401 error message on `/login`.
4. Directly visiting `/ui` without a session cookie must redirect to `/login`.
5. Accessing `/login` with an existing `Definitiva` session redirects to `/ui` rather than `/`.

---

### Task 1: Environment Variables Setup

**Files:**
- Modify: `.env.local`
- Modify: `.env.example`

**Interfaces:**
- Consumes: None
- Produces: `process.env.BRAIN_GATE_SECRET="Definitiva"`

- [ ] **Step 1: Update `.env.local`**
Add `BRAIN_GATE_SECRET="Definitiva"` to `.env.local` without touching existing variables.

- [ ] **Step 2: Update `.env.example`**
Add `BRAIN_GATE_SECRET="Definitiva"` to `.env.example` for documentation.

- [ ] **Step 3: Verify environment variables**
Run: `grep "BRAIN_GATE_SECRET" .env.local .env.example`
Expected: `BRAIN_GATE_SECRET="Definitiva"` in both files.

---

### Task 2: Auth Library Dual-Secret & Target Verification

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: `process.env.ACCESS_GATE_SECRET`, `process.env.BRAIN_GATE_SECRET`
- Produces:
  - `createSessionToken(secret: string, maxAgeSeconds?: number, target?: string): Promise<string>`
  - `verifySessionTokenWithTarget(token: string | undefined, secrets: (string | undefined)[]): Promise<{ valid: boolean; target: string }>`
  - Backwards-compatible `verifySessionToken(token: string | undefined, secret: string | undefined): Promise<boolean>`

- [ ] **Step 1: Implement `createSessionToken` with optional target and backwards compatibility in `lib/auth.ts`**
Allow `target` to be passed, format token as `${expiresAtMs}.${signatureHex}.${encodedTarget}` when provided, while keeping compatibility with legacy 2-part tokens.

- [ ] **Step 2: Implement `verifySessionTokenWithTarget` in `lib/auth.ts`**
Verify tokens against an array of secrets (e.g. `[ACCESS_GATE_SECRET, BRAIN_GATE_SECRET]`) and extract target (`"/"` or `"/ui"`).

- [ ] **Step 3: Verify type checking**
Run: `npx tsc --noEmit`
Expected: 0 type errors in `lib/auth.ts`.

---

### Task 3: Auth Session Route Dual-PIN Validation

**Files:**
- Modify: `app/api/auth/session/route.ts`

**Interfaces:**
- Consumes: `verifyPinConstantTime`, `createSessionToken`, `process.env.ACCESS_GATE_SECRET`, `process.env.BRAIN_GATE_SECRET`
- Produces: `POST /api/auth/session` returning `{ authenticated: true, redirectTo: string }`

- [ ] **Step 1: Update `app/api/auth/session/route.ts`**
Read both `ACCESS_GATE_SECRET` and `BRAIN_GATE_SECRET`.
Check if `pin` matches `BRAIN_GATE_SECRET` -> if so, `target = "/ui"`, secret is `BRAIN_GATE_SECRET`.
Else check if `pin` matches `ACCESS_GATE_SECRET` -> if so, `target = "/"`, secret is `ACCESS_GATE_SECRET`.
Else return 401 with `"PIN di accesso non valido. Riprova."`.
Emit cookie and return `{ authenticated: true, redirectTo: target }`.

- [ ] **Step 2: Verify type checking**
Run: `npx tsc --noEmit`
Expected: 0 type errors.

---

### Task 4: Login Frontend Dynamic Redirection

**Files:**
- Modify: `app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: Response from `POST /api/auth/session` containing `redirectTo`
- Produces: Navigation to `redirectTo || "/"`

- [ ] **Step 1: Update `handleSubmit` in `app/(auth)/login/page.tsx`**
Parse JSON response from `/api/auth/session`.
Navigate to `data.redirectTo || "/"` instead of hardcoded `"/"`.

- [ ] **Step 2: Verify type checking**
Run: `npx tsc --noEmit`
Expected: 0 type errors.

---

### Task 5: Middleware Session Target and Route Protection

**Files:**
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `verifySessionTokenWithTarget` from `lib/auth.ts`
- Produces: Routing protection for `/`, `/ui`, and `/api/*`, dynamic redirect on `/login`

- [ ] **Step 1: Update `middleware.ts`**
Use `verifySessionTokenWithTarget(sessionToken, [process.env.ACCESS_GATE_SECRET, process.env.BRAIN_GATE_SECRET])`.
If authenticated and visiting `/login`: redirect to `target || "/"`.
If not authenticated and visiting protected UI (`/`, `/ui`, or subpaths): redirect to `/login` and clear cookie.
Allow access to `/ui` for authenticated users.

- [ ] **Step 2: Verify type checking**
Run: `npx tsc --noEmit`
Expected: 0 type errors.

---

### Task 6: Create Blank UI Canvas

**Files:**
- Create: `app/ui/page.tsx`

**Interfaces:**
- Consumes: None
- Produces: Standalone page route at `/ui`

- [ ] **Step 1: Create `app/ui/page.tsx`**
Export default component rendering an empty, completely white canvas:
```tsx
export default function BrainUIPage() {
  return <main className="min-h-screen w-full bg-white" />;
}
```

- [ ] **Step 2: Verify route build**
Run: `npx tsc --noEmit`
Expected: 0 type errors.

---

### Task 7: Full Application Build & Verification

**Files:**
- Read/Test: whole workspace build

- [ ] **Step 1: Execute Next.js build**
Run: `npm run build`
Expected: Build succeeds with all routes generated, including `/`, `/login`, `/ui`, and `/api/auth/session`.

- [ ] **Step 2: Verify automated test or curl behavior (if dev server running)**
Confirm no syntax, runtime, or import issues exist.
