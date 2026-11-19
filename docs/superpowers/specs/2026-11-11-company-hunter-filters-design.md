# Design Doc: Company Hunter — Filtri Parametrici & Gerarchia di Ricerca

## 1. Intent e Obiettivo
Consentire all'utente di Company Hunter di specificare filtri precisi di ricerca B2B (Dimensione Aziendale, Area Geografica, Categoria/Settore) tramite un pannello a 3 box attivabile da un pulsante filtri nella barra di ricerca, con priorità assoluta di override rispetto al testo libero della query, mantenendo lo stile dark minimale e le animazioni fluide attuali.

## 2. Obiettivi, Non-Obiettivi e Vincoli

### Obiettivi
- **Pulsante Parametri**: Posizionato nella barra di ricerca a destra, immediatamente a sinistra del pulsante di Invio (che rimane sul bordo destro estremo).
- **Spostamento della Chat**: All'apertura dei parametri, la barra si sposta verso l'alto per dare spazio ai 3 box sottostanti; alla chiusura torna in posizione originale.
- **Pannello a 3 Box (Glassmorphism Dark)**:
  1. *Dimensione*: Fatturato o dipendenti (es. placeholder `Es. 10M - 50M €`).
  2. *Area Geografica*: Città, regione o macroarea (es. `Es. Nord Italia, Piemonte`).
  3. *Categoria*: Settore merceologico (es. `Es. SaaS, Manifatturiero`).
- **Persistenza & Reset**:
  - I valori inseriti nei 3 box persistono mentre il pannello viene aperto o chiuso.
  - Se l'utente invia la query con i pannelli aperti, i 3 pannelli scompaiono rapidamente, la barra torna in posizione originale e parte la sequenza di animazione orb/mondo.
  - Al termine della domanda o al click su "new question", tutti i campi (testo e 3 filtri) vengono resettati a vuoto per la nuova ricerca.
- **Priorità Assoluta (Override)**:
  - I parametri nei 3 box sovrascrivono categoricamente qualsiasi valore in contrasto nel testo del prompt.
  - Se un box è vuoto, il parametro corrispondente viene dedotto/estratto dal testo del prompt.
- **Output Classifica 5 Aziende**:
  - L'output dell'agente e la classifica finale mostrano esattamente 5 aziende qualificate.

### Non-Obiettivi
- Non sostituire la dashboard classica (`/`), ma potenziare l'esperienza `/ui` ("Company Hunter") collegandola alla pipeline agentica reale.
- Non alterare i gradienti e la palette cromatica esistente.

---

## 3. Approcci Considerati

### Approccio A (Pannello Esterno Scorrelato dal Form)
- Creare i 3 box come componente separato nel container genitore di `app/ui/page.tsx` controllato tramite state esterno.
- *Svantaggi*: Mancata sincronizzazione con le animazioni interne di `MorphOrb` (che gestisce posizionamento, mover, transizioni orb e launch). Se la barra si trasforma in orb, i box rimarrebbero slegati dalla pipeline di movimento.

### Approccio B (Integrazione Diretta in MorphOrb + Props/State Reattivo) — *RACCOMANDATO*
- Integrare il pulsante filtri e il container dei 3 box all'interno o direttamente coordinato con `MorphOrb`:
  - Nel div `.mo-input`, aggiungere il pulsante parametri prima di `.mo-send`.
  - Spostare verso l'alto `.mo-mover` o la barra (`translateY(-70px)`) con transizione fluida Framer Motion/CSS quando il pannello è aperto.
  - Inserire il pannello dei 3 box sotto la barra, renderizzato con Framer Motion (`AnimatePresence`).
  - Su invio (`onFormSubmit`): chiudere istantaneamente il pannello filtri, riposizionare la barra a 0 e avviare la sequenza standard di elaborazione.
  - Passare i filtri come `mandatoryParams` alla callback `onSubmit` che chiama `/api/scout`.
  - In `step1-intent-discovery.ts` e `orchestrator.ts`, rinforzare l'override vincolante dei `mandatoryParams` sui parametri estratti dal prompt libero e fissare la quota a 5 aziende.
  - Resettare i 3 campi e l'input al click su `new question` / reset.

---

## 4. Dettagli di Implementazione

1. **UI (`app/ui/components/MorphOrb.tsx` & `MorphOrb.css`)**:
   - Stato `isParamsOpen: boolean` e `params: { dimensione: string, area: string, categoria: string }`.
   - Pulsante slider/filtri inserito a sinistra del pulsante Invio all'interno di `.mo-input`.
   - Box parametri con classe glassmorphism dark (`backdrop-blur-md`, `border-white/10`, sfondo `rgba(22,22,23,0.7)`).
   - Animazione di spostamento verso l'alto della barra (`mo-actor` o `mo-mover`) quando `isParamsOpen` è `true`.
   - Chiusura rapida al click su Invio o Enter prima del launch.
   - Reset dei parametri in `rt.reset()` / `onReset`.

2. **Integrazione API & Payload (`app/ui/page.tsx` & `/api/scout`)**:
   - `handleAgentSubmit` in `app/ui/page.tsx` invia a `/api/scout` il prompt e l'oggetto `mandatoryParams: { dimensioneAziendale, areaGeografica, categoriaSettore }`.
   - Aggiornamento della classifica `companies` (RankedCompanyItem[]) con le 5 aziende restituite da `/api/scout`.

3. **Logica di Override & Prompting (`agents/step1-intent-discovery.ts` & `agents/orchestrator.ts`)**:
   - Regola ferrea nel prompt di sistema: i campi in `mandatoryParams` sovrascrivono qualunque menzione contraria nel testo del prompt.
   - Se `mandatoryParams` non è valorizzato per un dato campo, estrazione da prompt testuale.
   - Forzatura di output a esattamente 5 aziende classificate (`constraints.requestedCount = 5`).
