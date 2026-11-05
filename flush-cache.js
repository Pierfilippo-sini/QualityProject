#!/usr/bin/env node

/**
 * ============================================================================
 * FLUSH-CACHE.JS — Diagnostica e Pulizia Forzata Context Caching Google Gemini
 * ============================================================================
 * 
 * Obiettivo:
 * 1. Legge la GEMINI_API_KEY da .env.local o .env
 * 2. Interroga le API di Google Gemini (endpoint REST v1beta/cachedContents / SDK)
 * 3. Elenca tutti i Context Cache attivi che generano costi orari di archiviazione
 * 4. Esegue un ciclo di eliminazione (DELETE) per cancellare ogni singola cache
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

// 1. Caricamento GEMINI_API_KEY da .env.local / .env
function loadApiKey() {
  const rootDir = __dirname;
  const envFiles = [".env.local", ".env"];

  for (const f of envFiles) {
    const fullPath = path.join(rootDir, f);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...vParts] = trimmed.split("=");
        if (k.trim() === "GEMINI_API_KEY") {
          let val = vParts.join("=").trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) return val;
        }
      }
    }
  }

  return process.env.GEMINI_API_KEY || "";
}

const apiKey = loadApiKey();

if (!apiKey) {
  console.error("❌ ERRORE: GEMINI_API_KEY non trovata in .env.local, .env o nelle variabili d'ambiente.");
  process.exit(1);
}

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/cachedContents";

async function listCachedContents() {
  const url = `${BASE_URL}?key=${apiKey}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Errore HTTP ${response.status} durante list(): ${errText}`);
  }

  const data = await response.json();
  // data.cachedContents è un array di oggetti: { name, model, createTime, updateTime, expireTime, displayName, usageMetadata }
  return data.cachedContents || [];
}

async function deleteCachedContent(cacheName) {
  // cacheName è tipicamente nel formato "cachedContents/xxxxxxxx"
  const url = `https://generativelanguage.googleapis.com/v1beta/${cacheName}?key=${apiKey}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Errore HTTP ${response.status} durante delete(${cacheName}): ${errText}`);
  }

  return true;
}

async function main() {
  console.log("=================================================================");
  console.log("🧹 GOOGLE GEMINI CONTEXT CACHING — DIAGNOSTICA E FLUSH FORZATO");
  console.log("=================================================================");
  console.log(`🔑 API Key rilevata: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
  console.log(`🌐 Endpoint REST: ${BASE_URL}`);
  console.log("-----------------------------------------------------------------");
  console.log("🔍 Ricerca contenuti in cache attivi associati alla chiave API...");

  try {
    const caches = await listCachedContents();

    if (caches.length === 0) {
      console.log("✅ NESSUN CONTEXT CACHING ATTIVO TROVATO.");
      console.log("👉 Al momento non ci sono cache salvate sui server Google che generano costi orari di archiviazione.");
      console.log("=================================================================\n");
      return;
    }

    console.log(`⚠️  TROVATI ${caches.length} CONTEXT CACHING ATTIVI:\n`);

    for (const [idx, item] of caches.entries()) {
      console.log(`[Cache #${idx + 1}]`);
      console.log(` • ID / Nome:       ${item.name}`);
      console.log(` • Nome Visualizzato: ${item.displayName || "N.D."}`);
      console.log(` • Modello:          ${item.model}`);
      console.log(` • Creazione:        ${item.createTime}`);
      console.log(` • Scadenza (TTL):   ${item.expireTime}`);
      if (item.usageMetadata) {
        console.log(` • Token in Cache:   ${item.usageMetadata.totalTokenCount || 0}`);
      }
      console.log("-----------------------------------------------------------------");
    }

    console.log("\n🚀 AVVIO ELIMINAZIONE FORZATA PER ARRESTARE I COSTI DI STORAGE...");

    let deletedCount = 0;
    for (const item of caches) {
      process.stdout.write(` • Eliminazione di ${item.name}... `);
      try {
        await deleteCachedContent(item.name);
        console.log("✅ ELIMINATO");
        deletedCount++;
      } catch (err) {
        console.log(`❌ ERRORE: ${err.message}`);
      }
    }

    console.log("\n=================================================================");
    console.log(`🏁 PULIZIA COMPLETATA: ${deletedCount}/${caches.length} cache rimosse con successo.`);
    console.log("=================================================================\n");

  } catch (err) {
    console.error("\n❌ ERRORE CRITICO DURANTE L'OPERAZIONE:", err.message);
    process.exit(1);
  }
}

main();
