# Report di Valutazione Backend Multi-Agente B2B (DUE)
**Generato il**: 05/11/2026 01:55:55  
**Iterazioni per Query (N_RUNS)**: 10  
**Aziende Target Analizzate per Run (N_COMPANIES)**: Prime 5 posizioni per rank  
**Soglia Valore di Fallback**: 7.0 (target=7.0 e trigger=7.0)  

> **Nota Metodologica sui Prompt**: I prompt inviati all'endpoint copiano verbatim TC1 e TC3 del vecchio script richiedendo 10 aziende. Come da specifica, l'analisi delle presenze, dei punteggi e della stabilità tiene conto delle prime **N_COMPANIES=5** posizioni per rank in ciascuna run, salvando comunque l'intero output nel CSV `runs.csv` e nei file raw.

---

## 1. Analisi Aziende per Query e Tracciamento Discrepanze

### Q1: Life Sciences, CDMO & Dispositivi Medici (Lombardia, Lazio & Toscana)
*Prompt Verbatim*: "Seleziona esattamente 10 aziende italiane d'eccellenza operanti nei settori Farmaceutico, Contract Development & Manufacturing Organization (CDMO) o Dispositivi Medici con stabilimenti o headquarter in Lombardia, Lazio o Toscana. I requisiti dimensionali richiedono un fatturato compreso tra 40M€ e 400M€ e oltre 120 dipendenti. Privilegia realtà che negli ultimi 24 mesi hanno inaugurato nuovi reparti produttivi, ottenuto approvazioni regolatorie internazionali (es. FDA/EMA), affrontato operazioni di M&A oppure avviato piani di decarbonizzazione/CSRD. Ordina le 10 aziende per priorità commerciale indicando i referenti decisionali."

| Azienda (Nome Normalizzato) | Presenze | Vettore Punteggi Finali (Run 1..10) | Min | Max | Media | StdDev | N. Fallback (7.0) | Alert / Discrepanza |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **abiogen pharma** | **6/10** | `9.0 \| - \| 9.3 \| - \| 8.9 \| 8.9 \| 9.0 \| - \| 9.0 \| -` | 8.9 | 9.3 | 9.02 | 0.15 | 0 | 🟢 Stabile |
| **catalent anagni** | **5/10** | `9.5 \| 9.3 \| 9.6 \| - \| - \| - \| - \| 9.5 \| 9.4 \| -` | 9.3 | 9.6 | 9.46 | 0.11 | 0 | 🟢 Stabile |
| **corden pharma** | **5/10** | `- \| 9.3 \| - \| 9.6 \| 9.3 \| 9.5 \| - \| 9.5 \| - \| -` | 9.3 | 9.6 | 9.44 | 0.13 | 0 | 🟢 Stabile |
| **l molteni c dei fratelli alitti** | **5/10** | `- \| 9.0 \| 9.4 \| 9.2 \| - \| 9.2 \| 9.1 \| - \| - \| -` | 9.0 | 9.4 | 9.18 | 0.15 | 0 | 🟢 Stabile |
| **fine foods pharmaceuticals ntm** | **4/10** | `- \| 9.0 \| 9.1 \| - \| 9.5 \| 9.2 \| - \| - \| - \| -` | 9.0 | 9.5 | 9.20 | 0.22 | 0 | 🟢 Stabile |
| **ibsa farmaceutici italia** | **3/10** | `9.4 \| - \| - \| 9.1 \| - \| 9.3 \| - \| - \| - \| -` | 9.1 | 9.4 | 9.27 | 0.15 | 0 | 🟢 Stabile |
| **haupt pharma latina** | **3/10** | `- \| 9.2 \| - \| - \| - \| - \| - \| 9.1 \| 9.1 \| -` | 9.1 | 9.2 | 9.13 | 0.06 | 0 | 🟢 Stabile |
| **flamma** | **2/10** | `- \| - \| - \| - \| 9.2 \| - \| 9.3 \| - \| - \| -` | 9.2 | 9.3 | 9.25 | 0.07 | 0 | 🟢 Stabile |
| **kedrion** | **2/10** | `- \| - \| - \| - \| - \| - \| 9.4 \| - \| 9.1 \| -` | 9.1 | 9.4 | 9.25 | 0.21 | 0 | 🟢 Stabile |
| **neopharmed gentili** | **2/10** | `- \| - \| - \| 9.1 \| - \| - \| - \| - \| - \| 9.3` | 9.1 | 9.3 | 9.20 | 0.14 | 0 | 🟢 Stabile |
| **haleon italy manufacturing** | **2/10** | `9.0 \| - \| - \| - \| - \| - \| - \| 9.3 \| - \| -` | 9.0 | 9.3 | 9.15 | 0.21 | 0 | 🟢 Stabile |
| **cosmo** | **2/10** | `- \| - \| - \| 8.8 \| 8.8 \| - \| - \| - \| - \| -` | 8.8 | 8.8 | 8.80 | 0.00 | 0 | 🟢 Stabile |
| **doc generici** | **1/10** | `9.6 \| - \| - \| - \| - \| - \| - \| - \| - \| -` | 9.6 | 9.6 | 9.60 | 0.00 | 0 | 🟢 Stabile |
| **polifarma** | **1/10** | `- \| - \| - \| - \| - \| - \| - \| 9.5 \| - \| -` | 9.5 | 9.5 | 9.50 | 0.00 | 0 | 🟢 Stabile |
| **ab medica** | **1/10** | `- \| - \| - \| - \| - \| - \| 9.4 \| - \| - \| -` | 9.4 | 9.4 | 9.40 | 0.00 | 0 | 🟢 Stabile |
| **istituto biochimico italiano giovanni lorenzini** | **1/10** | `- \| - \| 9.3 \| - \| - \| - \| - \| - \| - \| -` | 9.3 | 9.3 | 9.30 | 0.00 | 0 | 🟢 Stabile |
| **chemi** | **1/10** | `- \| - \| - \| - \| - \| - \| - \| - \| 9.0 \| -` | 9.0 | 9.0 | 9.00 | 0.00 | 0 | 🟢 Stabile |
| **laboratori guidotti** | **1/10** | `- \| - \| - \| - \| - \| - \| - \| - \| - \| 8.8` | 8.8 | 8.8 | 8.80 | 0.00 | 0 | 🟢 Stabile |

### Q2: Logistica Filiera del Freddo (Cold Chain), Hub Intermodali & 3PL (Nord e Centro Italia)
*Prompt Verbatim*: "Identifica 10 primarie aziende logistiche specializzate nella catena del freddo (Cold Chain per Food & Pharma), nella logistica conto terzi (3PL avanzata) o nella gestione di piattaforme intermodali con nodi strategici nel Nord o Centro Italia. I parametri dimensionali richiedono un fatturato superiore a 35M€ e almeno 90 dipendenti o estese superfici di stoccaggio a temperatura controllata. Evidenzia operatori che hanno ampliato magazzini green con certificazioni LEED/BREEAM, introdotto sistemi WMS/TMS avanzati o siglato accordi distributivi con la GDO e il canale ospedaliero. Restituisci 10 aziende ordinate per score."

| Azienda (Nome Normalizzato) | Presenze | Vettore Punteggi Finali (Run 1..10) | Min | Max | Media | StdDev | N. Fallback (7.0) | Alert / Discrepanza |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **stef italia** | **9/10** | `9.5 \| 9.4 \| 9.5 \| 9.6 \| 9.6 \| 9.5 \| 9.5 \| 9.5 \| 9.0 \| -` | 9.0 | 9.6 | 9.46 | 0.18 | 0 | 🟢 Stabile |
| **number 1 logistics group** | **5/10** | `9.4 \| 9.4 \| - \| - \| - \| 9.5 \| - \| 9.5 \| 9.4 \| -` | 9.4 | 9.5 | 9.44 | 0.05 | 0 | 🟢 Stabile |
| **italtrans** | **5/10** | `- \| 9.1 \| - \| 9.4 \| 9.2 \| 9.3 \| 9.5 \| - \| - \| -` | 9.1 | 9.5 | 9.30 | 0.16 | 0 | 🟢 Stabile |
| **brivio vigano logistics** | **4/10** | `- \| 9.3 \| 9.5 \| 9.4 \| - \| - \| 9.3 \| - \| - \| -` | 9.3 | 9.5 | 9.38 | 0.10 | 0 | 🟢 Stabile |
| **bcube** | **4/10** | `- \| - \| 9.3 \| 9.2 \| 9.2 \| - \| - \| - \| 9.3 \| -` | 9.2 | 9.3 | 9.25 | 0.06 | 0 | 🟢 Stabile |
| **kuehne nagel** | **3/10** | `- \| - \| - \| - \| 9.5 \| 9.5 \| - \| 9.4 \| - \| -` | 9.4 | 9.5 | 9.47 | 0.06 | 0 | 🟢 Stabile |
| **dhl supply chain italy** | **3/10** | `- \| - \| - \| 9.5 \| 9.2 \| - \| - \| 9.6 \| - \| -` | 9.2 | 9.6 | 9.43 | 0.21 | 0 | 🟢 Stabile |
| **arcese trasporti** | **3/10** | `9.5 \| - \| 9.5 \| - \| - \| - \| - \| 9.2 \| - \| -` | 9.2 | 9.5 | 9.40 | 0.17 | 0 | 🟢 Stabile |
| **safim societa azionaria frigoriferi industriali magazzini** | **2/10** | `- \| - \| - \| - \| - \| - \| 9.3 \| - \| 9.2 \| -` | 9.2 | 9.3 | 9.25 | 0.07 | 0 | 🟢 Stabile |
| **ceva logistics italia** | **1/10** | `9.5 \| - \| - \| - \| - \| - \| - \| - \| - \| -` | 9.5 | 9.5 | 9.50 | 0.00 | 0 | 🟢 Stabile |
| **gxo logistics italy** | **1/10** | `- \| - \| 9.5 \| - \| - \| - \| - \| - \| - \| -` | 9.5 | 9.5 | 9.50 | 0.00 | 0 | 🟢 Stabile |
| **chiapparoli logistica** | **1/10** | `- \| - \| - \| - \| - \| 9.4 \| - \| - \| - \| -` | 9.4 | 9.4 | 9.40 | 0.00 | 0 | 🟢 Stabile |
| **savino del bene trasporti internazionali agenzia marittima** | **1/10** | `- \| - \| - \| - \| - \| - \| 9.4 \| - \| - \| -` | 9.4 | 9.4 | 9.40 | 0.00 | 0 | 🟢 Stabile |
| **dachser fercam italia** | **1/10** | `9.3 \| - \| - \| - \| - \| - \| - \| - \| - \| -` | 9.3 | 9.3 | 9.30 | 0.00 | 0 | 🟢 Stabile |
| **bracchi** | **1/10** | `- \| 9.2 \| - \| - \| - \| - \| - \| - \| - \| -` | 9.2 | 9.2 | 9.20 | 0.00 | 0 | 🟢 Stabile |
| **gruber logistics** | **1/10** | `- \| - \| - \| - \| - \| - \| - \| - \| 9.1 \| -` | 9.1 | 9.1 | 9.10 | 0.00 | 0 | 🟢 Stabile |

---

## 2. Statistiche per Query e Globali

| Metrica Analitica | Q1 (Life Sciences) | Q2 (Cold Chain) | Globale (20 Run) |
| :--- | :---: | :---: | :---: |
| **Success Rate** | 100.0% (10/10) | 90.0% (9/10) | **95.0%** (19/20) |
| **Latenza Media** | 82.6s | 65.4s | **74.0s** |
| **Latenza p95** | 115.1s | 84.7s | **99.5s** |
| **Latenza Max** | 115.1s | 84.7s | **115.1s** |
| **Righe Fallback (7.0)** | 0.0% (0/47) | 0.0% (0/45) | **0.0%** (0/92) |
| **Jaccard Similarity Medio** | 14.3% | 28.7% | - |
| **Top-1 Consistency** | 30.0% | 55.6% | - |
| **Campi Obbligatori Presenti** | 100.0% | 100.0% | **100.0%** |
| **Sospetto Troncamento Stringhe** | 0.0% (0) | 0.0% (0) | **0.0%** (0) |

---

## 3. Sezione Anomalie e Diagnosi del Fallback (7.0)

### 3.1 Run con Errori o Latenza Oltre 1.5x la Media
*Soglia di latenza anomala (1.5x media globale)*: **111.1s**

| Query | Run | HTTP Status | Latenza (s) | Tipologia Anomalia | Dettaglio Errore |
| :---: | :---: | :---: | :---: | :--- | :--- |
| **Q1** | 5 | 200 | 115.1s | Latenza Elevata (115.1s) | Nessun errore HTTP (rallentamento esterno o Maps) |
| **Q2** | 10 | 500 | 0.4s | Errore HTTP 500 | HTTP 500: {"error":"402 API error occurred: {\"httpMeta\":{\"response\":{},\"request\":{}}}","debug_trace":{"guardrail_passed":false,"requested_count":5,"api_status":{"gemini":"error","google_maps":"connected"},"considered_companies":[],"discarded_companies":[],"subagent_steps":[{"step_number":0,"agent_name": |

### 3.2 Contesto delle Righe con Punteggio Fallback (target=7.0, trigger=7.0)
Verifica dell'ipotesi: *I punteggi 7.0 coincidono con timeout/429/errori HTTP oppure compaiono in run 200 regolari?*

🟢 Nessuna riga con fallback [7.0, 7.0] rilevata nel dataset analizzato.

---
*Report generato da `scout_eval.py` senza utilizzo di API LLM esterne.*