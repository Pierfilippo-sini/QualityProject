import {
  GOOGLE_MAPS_PLACES_API_ID,
  getGoogleMapsApiKey,
} from "@/lib/agent-config";
import {
  deduplicateCompaniesKeepMostRecent,
  verifyStrictGeographyConstraint,
} from "@/lib/company-dedup-and-geo";
import {
  verifyCompaniesBatchOnMaps,
  verifySingleCompanyOnPlacesApi,
  type SingleCompanyMapsVerification,
} from "@/lib/google-maps";
import type { StepExecutionResult } from "@/lib/telemetry";
import type {
  ApiConnectionStatus,
  DiscardedCompanyTrace,
  MapsOperationalStatus,
  ParsedSearchConstraints,
  Source,
} from "@/lib/types";
import {
  sanitizeValidSources,
  type VerifiedGatekeeperCompany,
} from "@/agents/step2-gatekeeper";

/**
 * Step 3 — Subagente Google Maps Verification (`Places API New` — `places:searchText`).
 *
 * Interroga `https://places.googleapis.com/v1/places:searchText` cercando `ragioneSociale + sedeCitta`:
 * - Verifica esistenza fisica, stato operativo (`OPERATIONAL`), indirizzo certificato, coordinate GPS,
 *   telefono, sito web e rating.
 * - Se `CLOSED_PERMANENTLY`, sposta l'azienda in `discarded` con motivo esatto:
 *   `"Attività risultante chiusa su Google Maps"`.
 * - Applica il filtro geografico stretto anche sull'indirizzo fisico certificato da Google Maps e
 *   deduplica eventuali società dello stesso gruppo che puntano allo stesso indirizzo fisico o dominio web,
 *   mantenendo esclusivamente il record con l'annualità più recente.
 */

export interface MapsVerifiedCompany extends VerifiedGatekeeperCompany {
  indirizzoVerificatoMaps: string | "N.D.";
  mapsStatus: MapsOperationalStatus;
  mapsRating: number | null;
  mapsCoordinates: { latitude: number; longitude: number } | null;
  mapsPhone: string | null;
  mapsWebsiteUri: string | null;
}

export interface Step3MapsInput {
  companies: VerifiedGatekeeperCompany[];
  constraints?: ParsedSearchConstraints;
}

export interface Step3MapsOutput {
  qualified: MapsVerifiedCompany[];
  discarded: DiscardedCompanyTrace[];
  mapsApiStatus: ApiConnectionStatus;
  warningMessage?: string;
}

const STAGE_LABEL = "Step 3 — Google Maps Verification";

/**
 * Esegue la chiamata Google Maps Places API (`places:searchText`) per una singola azienda candidata
 * in modo indipendente e simultaneo allo Step 2 (`Promise.allSettled`).
 */
export async function verifySingleCandidateOnMaps(params: {
  companyId: string;
  ragioneSociale: string;
  sedeCitta: string;
}): Promise<{
  verification: SingleCompanyMapsVerification;
  apiStatus: ApiConnectionStatus;
  warningMessage?: string;
}> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return {
      apiStatus: "missing_key",
      warningMessage:
        "GOOGLE_MAPS_API_KEY non configurata in .env.local: verifica fisica Google Maps saltata (stato UNVERIFIED) senza bloccare la pipeline.",
      verification: {
        companyId: params.companyId,
        ragioneSociale: params.ragioneSociale,
        query: `${params.ragioneSociale} ${params.sedeCitta} Italia`.trim(),
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

  const { verification, httpErrorStatus } =
    await verifySingleCompanyOnPlacesApi({
      companyId: params.companyId,
      ragioneSociale: params.ragioneSociale,
      sedeCitta: params.sedeCitta,
      apiKey,
    });

  if (httpErrorStatus !== undefined) {
    return {
      verification,
      apiStatus: "error",
      warningMessage: `Google Maps Places API ha restituito un errore (${verification.errorDetail ?? `HTTP ${httpErrorStatus}`}). Pipeline proseguita in modalità resiliente.`,
    };
  }

  return {
    verification,
    apiStatus: "connected",
  };
}

/**
 * Combina il risultato dello Step 2 (`VerifiedGatekeeperCompany`) con l'esito già risolto in parallelo
 * dallo Step 3 (`SingleCompanyMapsVerification`), applicando il filtro `CLOSED_PERMANENTLY`
 * e il vincolo geografico stretto sull'indirizzo fisico certificato.
 */
export function mergeCandidateWithMapsVerification(
  company: VerifiedGatekeeperCompany,
  v: SingleCompanyMapsVerification | undefined,
  constraints?: ParsedSearchConstraints
): {
  qualifiedCompany?: MapsVerifiedCompany;
  discardedTrace?: DiscardedCompanyTrace;
} {
  if (v?.discardPermanentlyClosed) {
    return {
      discardedTrace: {
        ragioneSociale: company.ragioneSociale,
        stage: STAGE_LABEL,
        reason: "Attività risultante chiusa su Google Maps",
      },
    };
  }

  const indirizzoVerificatoMaps = v?.indirizzoVerificatoMaps ?? "N.D.";

  if (constraints && indirizzoVerificatoMaps !== "N.D.") {
    const geoCheck = verifyStrictGeographyConstraint({
      ragioneSociale: company.ragioneSociale,
      sedeCitta: company.sedeCitta,
      sedeRegione: company.sedeRegione,
      indirizzoVerificatoMaps,
      constraints,
    });

    if (!geoCheck.passes) {
      return {
        discardedTrace: {
          ragioneSociale: company.ragioneSociale,
          stage: STAGE_LABEL,
          reason:
            geoCheck.reason ??
            `Indirizzo fisico Google Maps (${indirizzoVerificatoMaps}) fuori dal perimetro geografico richiesto.`,
        },
      };
    }
  }

  const extraSources: Source[] = [];
  if (v?.googleMapsUri) {
    extraSources.push({
      title: `${company.ragioneSociale} — Scheda Sede Certificata (Google Maps)`,
      url: v.googleMapsUri,
      sourceType: "GOOGLE_MAPS",
    });
  }
  if (v?.websiteUri) {
    extraSources.push({
      title: `${company.ragioneSociale} — Sito Ufficiale (verificato Maps)`,
      url: v.websiteUri,
      sourceType: "INSTITUTIONAL",
    });
  }

  const mergedSources = sanitizeValidSources([
    ...company.sources,
    ...extraSources,
  ]);

  return {
    qualifiedCompany: {
      ...company,
      indirizzoVerificatoMaps,
      mapsStatus: v?.mapsStatus ?? "UNVERIFIED",
      mapsRating: v?.rating ?? null,
      mapsCoordinates: v?.coordinates ?? null,
      mapsPhone: v?.phone ?? null,
      mapsWebsiteUri: v?.websiteUri ?? null,
      sources: mergedSources,
    },
  };
}

export async function runStep3MapsVerification(
  input: Step3MapsInput
): Promise<StepExecutionResult<Step3MapsOutput>> {

  if (input.companies.length === 0) {
    return {
      output: {
        qualified: [],
        discarded: [],
        mapsApiStatus: "connected",
      },
      modelUsed: GOOGLE_MAPS_PLACES_API_ID,
      fallbackTriggered: false,
    };
  }

  const batchOutcome = await verifyCompaniesBatchOnMaps(
    input.companies.map((c) => ({
      companyId: c.id,
      ragioneSociale: c.ragioneSociale,
      sedeCitta: c.sedeCitta,
    }))
  );

  const verificationById = new Map(
    batchOutcome.results.map((r) => [r.companyId, r])
  );

  const rawQualified: MapsVerifiedCompany[] = [];
  const discarded: DiscardedCompanyTrace[] = [];

  for (const company of input.companies) {
    const v = verificationById.get(company.id);

    if (v?.discardPermanentlyClosed) {
      discarded.push({
        ragioneSociale: company.ragioneSociale,
        stage: STAGE_LABEL,
        reason: "Attività risultante chiusa su Google Maps",
      });
      continue;
    }

    const indirizzoVerificatoMaps = v?.indirizzoVerificatoMaps ?? "N.D.";

    // Verifica del vincolo geografico stretto anche sull'indirizzo fisico certificato da Google Maps
    if (input.constraints && indirizzoVerificatoMaps !== "N.D.") {
      const geoCheck = verifyStrictGeographyConstraint({
        ragioneSociale: company.ragioneSociale,
        sedeCitta: company.sedeCitta,
        sedeRegione: company.sedeRegione,
        indirizzoVerificatoMaps,
        constraints: input.constraints,
      });

      if (!geoCheck.passes) {
        discarded.push({
          ragioneSociale: company.ragioneSociale,
          stage: STAGE_LABEL,
          reason:
            geoCheck.reason ??
            `Indirizzo fisico Google Maps (${indirizzoVerificatoMaps}) fuori dal perimetro geografico richiesto.`,
        });
        continue;
      }
    }

    const extraSources: Source[] = [];
    if (v?.googleMapsUri) {
      extraSources.push({
        title: `${company.ragioneSociale} — Scheda Sede Certificata (Google Maps)`,
        url: v.googleMapsUri,
        sourceType: "GOOGLE_MAPS",
      });
    }
    if (v?.websiteUri) {
      extraSources.push({
        title: `${company.ragioneSociale} — Sito Ufficiale (verificato Maps)`,
        url: v.websiteUri,
        sourceType: "INSTITUTIONAL",
      });
    }

    const mergedSources = sanitizeValidSources([
      ...company.sources,
      ...extraSources,
    ]);

    rawQualified.push({
      ...company,
      indirizzoVerificatoMaps,
      mapsStatus: v?.mapsStatus ?? "UNVERIFIED",
      mapsRating: v?.rating ?? null,
      mapsCoordinates: v?.coordinates ?? null,
      mapsPhone: v?.phone ?? null,
      mapsWebsiteUri: v?.websiteUri ?? null,
      sources: mergedSources,
    });
  }

  // Deduplicazione post-Maps (stessa P.IVA, stesso dominio ufficiale da Maps, stesso brand o stesso indirizzo fisico)
  // mantenendo sempre e solo il record con i dati di bilancio più recenti.
  const dedupResult = deduplicateCompaniesKeepMostRecent(
    rawQualified,
    STAGE_LABEL
  );
  const qualified = dedupResult.deduplicated;
  discarded.push(...dedupResult.discardedDuplicates);

  return {
    output: {
      qualified,
      discarded,
      mapsApiStatus: batchOutcome.apiStatus,
      warningMessage: batchOutcome.warningMessage,
    },
    modelUsed: GOOGLE_MAPS_PLACES_API_ID,
    fallbackTriggered: false,
    outputPayloadForTrace: {
      mapsApiStatus: batchOutcome.apiStatus,
      warningMessage: batchOutcome.warningMessage ?? null,
      verifiedCount: qualified.length,
      discardedCount: discarded.length,
      placesDetails: batchOutcome.results,
    },
  };
}
