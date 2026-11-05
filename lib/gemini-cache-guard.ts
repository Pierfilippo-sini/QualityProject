import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "@/lib/agent-config";

/**
 * ============================================================================
 * GEMINI CACHE GUARD — Prevenzione Costi Orari di Storage Context Caching
 * ============================================================================
 * 
 * Regole di Prevenzione:
 * 1. TTL Breve Forzato: Qualsiasi Context Cache creata deve avere un TTL massimo
 *    di 10 minuti (600 secondi) per impedire l'accumulo di costi di archiviazione
 *    a riposo sui server Google AI Studio.
 * 2. Lifecycle Cleanup Hook: Registrazione delle cache create durante la sessione
 *    ed eliminazione deterministica a fine pipeline (anche in caso di eccezione).
 * 3. Fallback Flush: Funzione per eliminare programmaticamente eventuali cache
 *    orfane o appese.
 * ============================================================================
 */

export const MAX_SAFE_CACHE_TTL_SECONDS = 600; // 10 minuti
export const MAX_SAFE_CACHE_TTL_STRING = "600s";

// Registro in memoria delle cache create durante l'esecuzione corrente
const activeSessionCaches = new Set<string>();

/**
 * Registra un ID di cache attiva per la pulizia a fine esecuzione.
 */
export function registerActiveCache(cacheName: string): void {
  if (cacheName) {
    activeSessionCaches.add(cacheName);
  }
}

/**
 * Elimina una singola cache via API REST/SDK.
 */
export async function deleteContextCache(cacheName: string): Promise<boolean> {
  const apiKey = getGeminiApiKey();
  if (!apiKey || !cacheName) return false;

  try {
    const formattedName = cacheName.startsWith("cachedContents/")
      ? cacheName
      : `cachedContents/${cacheName}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/${formattedName}?key=${apiKey}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      activeSessionCaches.delete(cacheName);
      activeSessionCaches.delete(formattedName);
      return true;
    }
  } catch (err) {
    console.warn(`[CacheGuard] Impossibile eliminare la cache ${cacheName}:`, err);
  }

  return false;
}

/**
 * Cleanup deterministico da invocare nel blocco `finally` dell'Orchestratore.
 * Distrugge immediatamente tutte le cache create durante la run corrente.
 */
export async function cleanupSessionCaches(): Promise<number> {
  if (activeSessionCaches.size === 0) return 0;

  const cachesToDelete = Array.from(activeSessionCaches);
  let cleaned = 0;

  await Promise.allSettled(
    cachesToDelete.map(async (name) => {
      const ok = await deleteContextCache(name);
      if (ok) cleaned++;
    })
  );

  activeSessionCaches.clear();
  return cleaned;
}

/**
 * Scansione e pulizia forzata di tutte le cache orfane associate all'API Key
 * (equivalente programmatico di `flush-cache.js`).
 */
export async function flushAllOrphanCaches(): Promise<{
  found: number;
  deleted: number;
}> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { found: 0, deleted: 0 };

  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`;
    const listRes = await fetch(listUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!listRes.ok) return { found: 0, deleted: 0 };

    const data = (await listRes.json()) as {
      cachedContents?: Array<{ name: string }>;
    };
    const items = data.cachedContents || [];
    if (items.length === 0) return { found: 0, deleted: 0 };

    let deleted = 0;
    await Promise.allSettled(
      items.map(async (item) => {
        const ok = await deleteContextCache(item.name);
        if (ok) deleted++;
      })
    );

    return { found: items.length, deleted };
  } catch (err) {
    console.warn("[CacheGuard] Errore durante flushAllOrphanCaches:", err);
    return { found: 0, deleted: 0 };
  }
}
