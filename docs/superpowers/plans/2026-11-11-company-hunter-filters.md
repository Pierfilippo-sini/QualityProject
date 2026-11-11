# Company Hunter Filters, Demo Simulation & Dynamic Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement parameter filters toggle, glassmorphic 3-panel UI, prompt override hierarchy, temporary Demo button for local simulation, and contextual reveal of the 5-company ranking and clients sections.

**Architecture:** Extend `MorphOrb` with an inline filters toggle button next to the send button, animate the search bar upward to reveal the 3 parameter cards (Dimensione, Area Geografica, Categoria), provide a local simulated search engine (no external API calls for now), add a sleek "Demo" button for testing, dynamically mount/reveal the `#reviews` (company ranking) and `#clients` (customer world) sections upon search/demo completion, and ensure full reset on new question.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion.

**Spec:** `docs/superpowers/specs/2026-11-11-company-hunter-filters-design.md`

## Global Constraints

- No external API calls for now (simulated local execution for testing).
- Style: Dark minimal, subtle borders (`rgba(255,255,255,0.08)` to `0.15`), backdrop-blur glassmorphism, iridescent underglow consistent with current palette.
- UI Layout: Parameter toggle button inside the search pill, immediately to the left of the send button; send button remains at the maximum right edge.
- Demo Button: Sleek, visible button ("Demo") near the search bar / header to trigger a standard simulated search.
- Movement: Search bar translates upward (`~ -75px`) when parameters panel opens, translates back down when closed.
- Fast Dismissal: If user submits or clicks Demo while panels are open, panels close quickly, bar resets position, and orb animation launches.
- Reset: On "new question" or reset, all 3 parameter fields and the search input reset to empty.
- Dynamic Reveal: The ranking cards section (`#reviews`) and clients globe (`#clients`), as well as the "Ranking" item in the navigation menu, are hidden on initial load and appear contextually after a search or demo is triggered.
- Hierarchy & Output: Parameter boxes have absolute priority over prompt text; unpopulated boxes are deduced from prompt text; output is exactly 5 companies.

---

### Task 1: Simulated Parameter Parser & 5-Company Generator

**Files:**
- Create: `lib/company-hunter-simulator.ts`
- Test: `scripts/test-simulator.ts`

- [ ] **Step 1: Write test for parameter extraction, override, and 5-company simulation**

Test that:
- When `area` in box is "Milano" and prompt is "aziende a Torino", resolved area is "Milano" (override).
- When `area` in box is empty and prompt is "aziende a Torino", resolved area is "Torino" (deduction).
- Returns exactly 5 ranked companies matching the criteria with `RankedCompanyItem` schema.

- [ ] **Step 2: Run test to make sure it fails**

Run: `npx tsx scripts/test-simulator.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement `lib/company-hunter-simulator.ts`**

Implement `resolveSearchCriteria(prompt, params)` and `simulateCompanyHunterSearch(prompt, params)` returning:
- `resolvedCriteria`: `{ categoria, area, dimensione }` with strict box override over prompt text and regex/keyword deduction for unpopulated fields.
- `companies`: exactly 5 `RankedCompanyItem` items with realistic data tailored to the resolved criteria (rank 1 to 5).
- `summary`: text summary for the orb answer card.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-simulator.ts`
Expected: PASS with 5 companies and correct override.

- [ ] **Step 5: Commit**

```bash
git add lib/company-hunter-simulator.ts scripts/test-simulator.ts
git commit -m "feat(simulator): add local company hunter search simulator with strict parameter override"
```

---

### Task 2: Parameter Toggle Button and Input Bar Layout in `MorphOrb.tsx`

**Files:**
- Modify: `app/ui/components/MorphOrb.tsx`
- Modify: `app/ui/components/MorphOrb.css`

- [ ] **Step 1: Update `MorphOrb.tsx` with parameter state and toggle button**

1. Add state in `MorphOrb.tsx`:
   - `isParamsOpen: boolean`
   - `params: { dimensione: string, area: string, categoria: string }`
2. Add toggle button inside `.mo-input` immediately before `.mo-send`:
   - Sliders icon
   - `mo-params-toggle` class
   - Active state styling when `isParamsOpen` is true
3. Update `onSubmit` signature in `MorphOrbProps` to accept `(text: string, params: { dimensione: string, area: string, categoria: string })`.

- [ ] **Step 2: Add CSS in `MorphOrb.css` for `.mo-params-toggle`**

Style `.mo-params-toggle` to sit directly to the left of `.mo-send`, matching its 36px circular shape, dark glassmorphism, and subtle glow.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/ui/components/MorphOrb.tsx app/ui/components/MorphOrb.css
git commit -m "feat(ui): add parameter toggle button in MorphOrb search pill"
```

---

### Task 3: Collapsible 3-Panel Parameters Glassmorphism UI & Motion Translation

**Files:**
- Modify: `app/ui/components/MorphOrb.tsx`
- Modify: `app/ui/components/MorphOrb.css`

- [ ] **Step 1: Add vertical translation when parameters open**

Translate `.mo-actor` or search bar upward (`translateY(-75px)`) smoothly when `isParamsOpen` is true; return to 0 when false.

- [ ] **Step 2: Render 3 parameter boxes underneath search bar**

Render 3 cards under the search bar using Framer Motion (`AnimatePresence`):
- Box 1: Dimensione (Building icon, "Dimensione", "Fatturato o Dipendenti", input `Es. 10M - 50M €`)
- Box 2: Area Geografica (MapPin icon, "Area Geografica", input `Es. Nord Italia, Piemonte`)
- Box 3: Categoria (Folder icon, "Categoria", input `Es. SaaS, Manifatturiero`)
Input values are preserved across open/close toggles.

- [ ] **Step 3: Fast dismissal on submit and reset on new question**

- If user submits (click send or enter) with panels open: close panels immediately (`isParamsOpen = false`), restore position, and launch orb animation.
- In `onReset` / `rt.reset()`: clear `params` to `{ dimensione: "", area: "", categoria: "" }` and `value` to `""`.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/ui/components/MorphOrb.tsx app/ui/components/MorphOrb.css
git commit -m "feat(ui): implement 3 glassmorphic parameter boxes with smooth translation and reset"
```

---

### Task 4: Demo Button, Dynamic Contextual Reveal of Ranking & Clients

**Files:**
- Modify: `app/ui/page.tsx`
- Modify: `app/ui/components/MorphOrb.tsx`

- [ ] **Step 1: Add "Demo" button and simulated search handling in `app/ui/page.tsx`**

1. Add state `hasSearchResults: boolean` (initial: `false`).
2. Add sleek "Demo" button in the hero/agent section.
3. When "Demo" is clicked:
   - Call simulated search using `simulateCompanyHunterSearch`.
   - Trigger orb animation through `morphOrbRef.current?.startDemo(...)` or `onSubmit`.
   - Update `companies` state with the 5 simulated companies.
   - Set `hasSearchResults = true`.
4. In `handleAgentSubmit`:
   - Call `simulateCompanyHunterSearch(query, mandatoryParams)`.
   - Update `companies` with the 5 simulated companies.
   - Set `hasSearchResults = true`.
   - Return the simulated answer summary for the orb card.

- [ ] **Step 2: Conditionally reveal `#reviews` (Ranking) and `#clients` (Clients)**

1. Hide `#reviews` and `#clients` when `hasSearchResults` is `false`.
2. Reveal both sections smoothly with Framer Motion when `hasSearchResults` becomes `true`.
3. Only show `["#reviews", "Ranking"]` in the menu nav list when `hasSearchResults` is `true`.
4. When "new question" is clicked, reset `hasSearchResults = false` (or retain until new search) and reset MorphOrb.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/ui/page.tsx app/ui/components/MorphOrb.tsx
git commit -m "feat(ui): add Demo button and contextual reveal of 5-company ranking and clients"
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: Verify all interactions and requirements**
- [ ] **Step 2: Full Next.js production build (`npm run build`)**
- [ ] **Step 3: Final Commit**
