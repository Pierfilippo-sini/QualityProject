# B2B Scouting Agent

Applicazione web **Next.js** per lo scouting, la verifica, la valutazione e il ranking automatizzato di aziende B2B tramite una pipeline multi-agente basata su **Google Gemini** e **Google Maps Places API**.

---

## Come funziona l'agente (Pipeline Multi-Agente)

Ogni ricerca avviata dall'utente attraversa in tempo reale una pipeline orchestrata in **6 fasi** (Step 0 – Step 5), con streaming progressivo verso il client:

1. **Step 0 — Input Guardrail**  
   Verifica che la richiesta sia pertinente allo scouting e all'analisi di aziende B2B, bloccando richieste fuori ambito.
2. **Step 1 — Intent Parser & Discovery SERP**  
   Estrae dal prompt o dai filtri i parametri della ricerca (settore, area geografica, dimensione aziendale, eventuali aziende specifiche da analizzare o da escludere) e individua le aziende candidate tramite Google Search Grounding.
3. **Step 2 — Gatekeeper & Parallel Data Extraction**  
   Analizza in parallelo ogni azienda candidata estraendo e normalizzando dati societari, fiscali e di bilancio (Partita IVA, fatturato, dipendenti, codice ATECO, classificazione GICS/ATECO) da fonti ufficiali e dal sito aziendale, applicando filtri geografici e dimensionali rigorosi.
4. **Step 3 — Google Maps Verification (Places API New)**  
   Eseguito in parallelo allo Step 2, verifica l'esistenza fisica e l'indirizzo certificato delle sedi operative tramite Google Maps Places API.
5. **Step 4 — Enrichment, CXI Matching & Buyer Personas**  
   Arricchisce il profilo delle aziende idonee individuando i bisogni operativi, il matching con le soluzioni CXI e definendo due Buyer Personas di riferimento.
6. **Step 5 — Scoring Breakdown & Email Hook**  
   Calcola il punteggio finale ponderato (bilanciando *Trigger Score* e *Target Fit*) e genera un pitch / email hook personalizzato per l'approccio commerciale.

---

## Ambienti e Funzionalità Principali

L'applicazione è protetta da un **Access Gate** (`/login`) basato su sessione stateless firmata (`HMAC-SHA256` in cookie `HttpOnly`) che instrada l'utente verso due ambienti distinti in base alla credenziale configurata:

- **Dashboard Operativa (`/`)**:
  - Ricerca tramite prompt in linguaggio naturale oppure parametri guidati.
  - Regolazione dinamica del peso tra *Trigger* e *Target Fit*.
  - Avanzamento in tempo reale della pipeline con visualizzazione grafica del ranking (`ScoutTable`, `AgentRankingRace`).
  - Scheda di dettaglio azienda (`CompanyDrawer`) con dati verificati, fonti, personas e breakdown del punteggio.
  - Pannello di telemetria tecnica (`DeveloperDebugTrace`) con dettaglio tempi, token e costi delle chiamate.
  - Esportazione dei risultati in **CSV** ed **Excel (`.xlsx`)**.
- **Interfaccia Interattiva (`/ui`)**:
  - Esperienza visiva animata con globo 3D interattivo, card di ranking con vista fronte/retro e modalità demo.

---

## Guida all'Utilizzo

Per ottenere risultati completi e precisi nella ricerca B2B, è consigliabile includere sempre i **3 parametri fondamentali**:

1. **Categoria / Settore**: ad esempio *"aziende manifatturiere"*, *"logistica e trasporti"*, *"software house"*, *"multiutility"*.
2. **Area Geografica**: macro-area (es. *Nord Italia*), regione (es. *Lombardia*), provincia o città/comune specifico.
3. **Dimensione Aziendale**: fascia di fatturato, numero di dipendenti oppure categoria (es. *PMI*, *Mid-Cap*, *Grandi Imprese*).

Opzionalmente è possibile:
- Indicare **aziende specifiche** da analizzare singolarmente.
- Specificare **esclusioni** (es. *"escludi azienda X"*) per scartarle preventivamente prima dell'analisi.
- Regolare il numero di aziende desiderate e i pesi di scoring prima di avviare o rieseguire la valutazione.

---

## Configurazione e Avvio in Locale

### Prerequisiti
- **Node.js** (versione 20 o superiore)
- **npm**
- Chiavi API valide per **Google Gemini** e **Google Maps Places API (New)**

### 1. Installazione delle dipendenze

```bash
npm install
```

### 2. Configurazione delle variabili d'ambiente

Crea un file `.env.local` nella root del progetto (partendo dal template `.env.example`, **senza mai committare `.env.local` su Git**):

```env
# Credenziali Access Gate (scegli le tue password personali)
ACCESS_GATE_SECRET="la-tua-password-dashboard"
BRAIN_GATE_SECRET="la-tua-password-ui"

# API Keys
GEMINI_API_KEY="la-tua-gemini-api-key"
GOOGLE_MAPS_API_KEY="la-tua-google-maps-api-key"

# Modelli e limiti pipeline
GEMINI_FAST_MODEL="gemini-3.8-flash"
GEMINI_SMART_MODEL="gemini-3.8-flash"
DEFAULT_COMPANIES_COUNT=5
MAX_COMPANIES_CAP=20
```

### 3. Avvio del server di sviluppo

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) nel browser (su macOS è disponibile anche lo script `AVVIA_APP.command` per l'avvio rapido da Finder).

### Build di produzione locale

```bash
npm run build
npm run start
```

---

## Stack Tecnologico

- **Framework**: Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **UI & Visualizzazioni**: Tailwind CSS v4, Radix UI, Framer Motion, D3.js, Spline
- **State Management**: Zustand
- **AI & Dati**: `@google/genai`, Google Maps Places API (New)
- **Export**: SheetJS (`xlsx`)

---

## Deploy su Vercel

Per pubblicare l'applicazione su Vercel:
1. Collega il repository al progetto Vercel.
2. Configura tutte le variabili d'ambiente presenti in `.env.local` nella sezione **Settings → Environment Variables** di Vercel (per *Production* e *Preview*).
3. Esegui il deploy automatico tramite push sul branch principale o tramite `vercel --prod`.
