import {
  GOOGLE_MAPS_SOLUTION_ID,
  GOOGLE_MAPS_TEXT_SEARCH_ENDPOINT,
  getGoogleMapsApiKey,
} from "@/lib/agent-config";
import type { ApiConnectionStatus, MapsOperationalStatus } from "@/lib/types";

/**
 * Client HTTP Server-Side per Google Maps Platform — Places API (New) `places:searchText`.
 * Riferimento ufficiale: https://developers.google.com/maps/documentation/places/web-service/text-search?utm_campaign=gmp_git_agentskills_v1
 *
 * Rispetta:
 * - Esecuzione esclusivamente Server-Side (nessuna chiamata browser diretta soggetta a CORS CF1)
 * - Header obbligatorio `X-Goog-FieldMask` per ottimizzazione costi e payload
 * - Header obbligatorio di attribuzione `X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1`
 * - Gestione resiliente di chiave assente o quota esaurita senza bloccare la pipeline B2B
 */

const PLACES_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.businessStatus",
  "places.rating",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
].join(",");

interface PlacesApiRawPlace {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?:
    | "OPERATIONAL"
    | "CLOSED_TEMPORARILY"
    | "CLOSED_PERMANENTLY"
    | string;
  rating?: number;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
}

interface PlacesTextSearchResponse {
  places?: PlacesApiRawPlace[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export interface SingleCompanyMapsVerification {
  companyId: string;
  ragioneSociale: string;
  query: string;
  matchedPlaceName: string | null;
  mapsStatus: MapsOperationalStatus;
  rawBusinessStatus: string | null;
  indirizzoVerificatoMaps: string | "N.D.";
  coordinates: { latitude: number; longitude: number } | null;
  phone: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  discardPermanentlyClosed: boolean;
  errorDetail?: string;
}

export interface BatchMapsVerificationOutcome {
  apiStatus: ApiConnectionStatus;
  warningMessage?: string;
  results: SingleCompanyMapsVerification[];
}

export async function verifySingleCompanyOnPlacesApi(params: {
  companyId: string;
  ragioneSociale: string;
  sedeCitta: string;
  apiKey: string;
}): Promise<{
  verification: SingleCompanyMapsVerification;
  httpErrorStatus?: number;
}> {
  const query = `${params.ragioneSociale} ${params.sedeCitta} Italia`.trim();

  try {
    const response = await fetch(GOOGLE_MAPS_TEXT_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": params.apiKey,
        "X-Goog-Maps-Solution-ID": GOOGLE_MAPS_SOLUTION_ID,
        "X-Goog-FieldMask": PLACES_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "it",
        regionCode: "IT",
        pageSize: 3,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errBody = (await response
        .json()
        .catch(() => null)) as PlacesTextSearchResponse | null;
      const errMsg =
        errBody?.error?.message ?? `HTTP ${response.status} da Places API`;

      return {
        httpErrorStatus: response.status,
        verification: {
          companyId: params.companyId,
          ragioneSociale: params.ragioneSociale,
          query,
          matchedPlaceName: null,
          mapsStatus: "UNVERIFIED",
          rawBusinessStatus: null,
          indirizzoVerificatoMaps: "N.D.",
          coordinates: null,
          phone: null,
          websiteUri: null,
          googleMapsUri: null,
          rating: null,
          discardPermanentlyClosed: false,
          errorDetail: errMsg,
        },
      };
    }

    const payload = (await response.json()) as PlacesTextSearchResponse;
    const topPlace = payload.places?.[0];

    if (!topPlace) {
      return {
        verification: {
          companyId: params.companyId,
          ragioneSociale: params.ragioneSociale,
          query,
          matchedPlaceName: null,
          mapsStatus: "UNVERIFIED",
          rawBusinessStatus: null,
          indirizzoVerificatoMaps: "N.D.",
          coordinates: null,
          phone: null,
          websiteUri: null,
          googleMapsUri: null,
          rating: null,
          discardPermanentlyClosed: false,
        },
      };
    }

    const rawStatus = topPlace.businessStatus ?? null;
    const isPermanentlyClosed = rawStatus === "CLOSED_PERMANENTLY";
    const mapsStatus: MapsOperationalStatus = isPermanentlyClosed
      ? "CLOSED"
      : rawStatus === "OPERATIONAL" || rawStatus === "CLOSED_TEMPORARILY"
        ? "OPERATIONAL"
        : topPlace.formattedAddress
          ? "OPERATIONAL"
          : "UNVERIFIED";

    const hasCoords =
      typeof topPlace.location?.latitude === "number" &&
      typeof topPlace.location?.longitude === "number";

    return {
      verification: {
        companyId: params.companyId,
        ragioneSociale: params.ragioneSociale,
        query,
        matchedPlaceName: topPlace.displayName?.text ?? null,
        mapsStatus,
        rawBusinessStatus: rawStatus,
        indirizzoVerificatoMaps: topPlace.formattedAddress?.trim() || "N.D.",
        coordinates: hasCoords
          ? {
              latitude: topPlace.location!.latitude!,
              longitude: topPlace.location!.longitude!,
            }
          : null,
        phone: topPlace.internationalPhoneNumber ?? null,
        websiteUri: topPlace.websiteUri ?? null,
        googleMapsUri: topPlace.googleMapsUri ?? null,
        rating: typeof topPlace.rating === "number" ? topPlace.rating : null,
        discardPermanentlyClosed: isPermanentlyClosed,
      },
    };
  } catch (error) {
    return {
      httpErrorStatus: 500,
      verification: {
        companyId: params.companyId,
        ragioneSociale: params.ragioneSociale,
        query,
        matchedPlaceName: null,
        mapsStatus: "UNVERIFIED",
        rawBusinessStatus: null,
        indirizzoVerificatoMaps: "N.D.",
        coordinates: null,
        phone: null,
        websiteUri: null,
        googleMapsUri: null,
        rating: null,
        discardPermanentlyClosed: false,
        errorDetail:
          error instanceof Error ? error.message : "Errore di rete Places API",
      },
    };
  }
}

/**
 * Esegue la verifica batch su Google Maps Places API (New) con concorrenza controllata (max 5 parallele).
 */
export async function verifyCompaniesBatchOnMaps(
  companies: Array<{
    companyId: string;
    ragioneSociale: string;
    sedeCitta: string;
  }>
): Promise<BatchMapsVerificationOutcome> {
  const apiKey = getGoogleMapsApiKey();

  if (!apiKey) {
    return {
      apiStatus: "missing_key",
      warningMessage:
        "GOOGLE_MAPS_API_KEY non configurata in .env.local: verifica fisica Google Maps saltata (stato UNVERIFIED) senza bloccare la pipeline.",
      results: companies.map((c) => ({
        companyId: c.companyId,
        ragioneSociale: c.ragioneSociale,
        query: `${c.ragioneSociale} ${c.sedeCitta} Italia`.trim(),
        matchedPlaceName: null,
        mapsStatus: "UNVERIFIED" as const,
        rawBusinessStatus: null,
        indirizzoVerificatoMaps: "N.D." as const,
        coordinates: null,
        phone: null,
        websiteUri: null,
        googleMapsUri: null,
        rating: null,
        discardPermanentlyClosed: false,
      })),
    };
  }

  const concurrency = 5;
  const results: SingleCompanyMapsVerification[] = new Array(companies.length);
  let hadApiError = false;
  let firstErrorDetail: string | undefined;

  let cursor = 0;
  async function worker() {
    while (cursor < companies.length) {
      const idx = cursor++;
      const item = companies[idx];
      const { verification, httpErrorStatus } =
        await verifySingleCompanyOnPlacesApi({
          companyId: item.companyId,
          ragioneSociale: item.ragioneSociale,
          sedeCitta: item.sedeCitta,
          apiKey: apiKey!,
        });
      results[idx] = verification;
      if (httpErrorStatus !== undefined) {
        hadApiError = true;
        if (!firstErrorDetail && verification.errorDetail) {
          firstErrorDetail = verification.errorDetail;
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, companies.length)) },
    () => worker()
  );
  await Promise.all(workers);

  const allFailed =
    hadApiError && results.every((r) => Boolean(r?.errorDetail));

  if (allFailed) {
    return {
      apiStatus: "error",
      warningMessage: `Google Maps Places API ha restituito un errore (${firstErrorDetail ?? "verifica quota o abilitazione Places API New"}). Pipeline proseguita in modalità resiliente.`,
      results,
    };
  }

  return {
    apiStatus: "connected",
    ...(hadApiError && firstErrorDetail
      ? {
          warningMessage: `Alcune query Places API non hanno risposto (${firstErrorDetail}).`,
        }
      : {}),
    results,
  };
}
