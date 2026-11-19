import { resolveSearchCriteria, simulateCompanyHunterSearch } from "../lib/company-hunter-simulator.ts";

function runTests() {
  console.log("Running simulator tests...");

  // Test 1: Override priority — Box area 'Milano' overrides prompt 'Torino'
  const res1 = resolveSearchCriteria("Cercami 5 aziende a Torino nel settore SaaS", {
    dimensione: "10M - 50M €",
    area: "Milano",
    categoria: "",
  });

  if (res1.area !== "Milano") {
    throw new Error(`Expected area to be 'Milano' (override), got '${res1.area}'`);
  }
  if (!res1.categoria.includes("SaaS")) {
    throw new Error(`Expected categoria to include 'SaaS' (deduced), got '${res1.categoria}'`);
  }
  if (res1.dimensione !== "10M - 50M €") {
    throw new Error(`Expected dimensione to be '10M - 50M €', got '${res1.dimensione}'`);
  }
  console.log("✓ Test 1 passed: Box parameters override prompt text and empty boxes deduce from prompt");

  // Test 2: Full deduction from prompt when all boxes are empty
  const res2 = resolveSearchCriteria("Aziende manifatturiere a Bologna con 50-250 dipendenti", {
    dimensione: "",
    area: "",
    categoria: "",
  });

  if (!res2.area.toLowerCase().includes("bologna")) {
    throw new Error(`Expected area to include 'Bologna', got '${res2.area}'`);
  }
  if (!res2.categoria.toLowerCase().includes("manifattur")) {
    throw new Error(`Expected categoria to include 'manifattur', got '${res2.categoria}'`);
  }
  console.log("✓ Test 2 passed: Full deduction from prompt");

  // Test 3: Simulation output has exactly 5 companies
  const sim = simulateCompanyHunterSearch("Cerco aziende digitali a Torino", {
    dimensione: "",
    area: "Piemonte",
    categoria: "Digital Services",
  });

  if (sim.companies.length !== 5) {
    throw new Error(`Expected exactly 5 companies, got ${sim.companies.length}`);
  }
  const ranks = sim.companies.map((c) => c.rank).sort((a, b) => a - b);
  if (JSON.stringify(ranks) !== JSON.stringify([1, 2, 3, 4, 5])) {
    throw new Error(`Expected ranks 1 to 5, got ${JSON.stringify(ranks)}`);
  }
  if (!sim.summary || sim.summary.length === 0) {
    throw new Error("Expected non-empty summary");
  }
  console.log("✓ Test 3 passed: Exactly 5 ranked companies with ranks 1..5 and summary");

  console.log("All simulator tests PASSED!");
}

runTests();
