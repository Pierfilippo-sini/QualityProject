"use client";

import { create } from "zustand";
import { recalculateAndSortCompanies, clampWeight } from "@/lib/scoring";
import type {
  CompanyResult,
  DebugTrace,
  MandatorySearchInput,
  ParsedSearchConstraints,
  ScoutResponsePayload,
  StreamStage,
} from "@/lib/types";

/**
 * Client State Stateless In-Memory.
 * Mantiene i 3 parametri obbligatori del form e l'array arricchito `CompanyResult[]`
 * condiviso tra Dashboard UI ed Export Excel Multi-Scheda (5 Tab) senza chiamate API aggiuntive.
 */
interface ScoutState {
  prompt: string;
  mandatoryForm: MandatorySearchInput;
  triggerWeight: number; // W_trigger in [0.0, 1.0] (default 0.5)
  parsedConstraints: ParsedSearchConstraints | null;
  responseType: "text_only" | "ranking" | null;
  textResponse: string | null;
  companies: CompanyResult[];
  debugTrace: DebugTrace | null;
  isDebugOpen: boolean;
  selectedCompanyId: string | null;
  isDrawerOpen: boolean;
  isStreaming: boolean;
  streamStage: StreamStage;
  statusMessage: string | null;
  errorMessage: string | null;

  setPrompt: (prompt: string) => void;
  setMandatoryField: <K extends keyof MandatorySearchInput>(
    field: K,
    value: MandatorySearchInput[K]
  ) => void;
  setMandatoryForm: (form: MandatorySearchInput) => void;
  setTriggerWeight: (weight: number) => void;
  setParsedConstraints: (constraints: ParsedSearchConstraints | null) => void;
  appendStreamedCompany: (company: CompanyResult) => void;
  setCompanies: (companies: CompanyResult[]) => void;
  setDebugTrace: (trace: DebugTrace | null) => void;
  setIsDebugOpen: (open: boolean) => void;
  applyScoutPayload: (payload: ScoutResponsePayload) => void;
  resetResults: () => void;
  openCompanyDrawer: (companyIdentifier: string) => void;
  closeCompanyDrawer: () => void;
  setStreamStatus: (
    isStreaming: boolean,
    stage: StreamStage,
    statusMessage?: string | null,
    errorMessage?: string | null
  ) => void;
}

export const useScoutStore = create<ScoutState>((set) => ({
  prompt: "",
  mandatoryForm: {
    categoriaSettore: "",
    areaGeografica: "",
    dimensioneAziendale: "",
    noteStrategiche: "",
  },
  triggerWeight: 0.5,
  parsedConstraints: null,
  responseType: null,
  textResponse: null,
  companies: [],
  debugTrace: null,
  isDebugOpen: false,
  selectedCompanyId: null,
  isDrawerOpen: false,
  isStreaming: false,
  streamStage: "IDLE",
  statusMessage: null,
  errorMessage: null,

  setPrompt: (prompt) => set({ prompt }),

  setMandatoryField: (field, value) =>
    set((state) => ({
      mandatoryForm: {
        ...state.mandatoryForm,
        [field]: value,
      },
    })),

  setMandatoryForm: (mandatoryForm) => set({ mandatoryForm }),

  setTriggerWeight: (weight) =>
    set((state) => {
      const normalized = clampWeight(weight);
      return {
        triggerWeight: normalized,
        companies: recalculateAndSortCompanies(state.companies, normalized),
      };
    }),

  setParsedConstraints: (parsedConstraints) =>
    set((state) => {
      if (!parsedConstraints) {
        return { parsedConstraints: null };
      }
      const nextWeight = clampWeight(parsedConstraints.suggestedTriggerWeight);
      return {
        parsedConstraints,
        triggerWeight: nextWeight,
        companies: recalculateAndSortCompanies(state.companies, nextWeight),
      };
    }),

  appendStreamedCompany: (company) =>
    set((state) => {
      const filtered = state.companies.filter(
        (item) =>
          item.id !== company.id &&
          item.ragioneSociale.toLowerCase() !==
            company.ragioneSociale.toLowerCase()
      );
      return {
        responseType: state.responseType ?? "ranking",
        companies: recalculateAndSortCompanies(
          [...filtered, company],
          state.triggerWeight
        ),
      };
    }),

  setCompanies: (companies) =>
    set((state) => ({
      companies: recalculateAndSortCompanies(companies, state.triggerWeight),
    })),

  setDebugTrace: (debugTrace) => set({ debugTrace }),

  setIsDebugOpen: (isDebugOpen) => set({ isDebugOpen }),

  applyScoutPayload: (payload) =>
    set((state) => {
      const wTrigger = clampWeight(
        payload.slider_weights?.w_trigger ?? state.triggerWeight
      );
      const safeCompanies = Array.isArray(payload.ranked_companies)
        ? payload.ranked_companies
        : [];

      return {
        responseType: payload.response_type,
        textResponse: payload.text_response ?? null,
        triggerWeight:
          payload.response_type === "ranking" ? wTrigger : state.triggerWeight,
        companies:
          payload.response_type === "ranking"
            ? recalculateAndSortCompanies(safeCompanies, wTrigger)
            : [],
        debugTrace: payload.debug_trace ?? state.debugTrace,
      };
    }),

  resetResults: () =>
    set({
      responseType: null,
      textResponse: null,
      companies: [],
      parsedConstraints: null,
      debugTrace: null,
      selectedCompanyId: null,
      isDrawerOpen: false,
      errorMessage: null,
      statusMessage: null,
      streamStage: "IDLE",
    }),

  openCompanyDrawer: (companyIdentifier) =>
    set({
      selectedCompanyId: companyIdentifier,
      isDrawerOpen: true,
    }),

  closeCompanyDrawer: () =>
    set({
      isDrawerOpen: false,
    }),

  setStreamStatus: (
    isStreaming,
    streamStage,
    statusMessage = null,
    errorMessage = null
  ) =>
    set({
      isStreaming,
      streamStage,
      statusMessage,
      errorMessage,
    }),
}));
