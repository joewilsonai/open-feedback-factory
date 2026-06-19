import type { AgentAssumptionRecord, AssumptionImpactArea } from "./types.js";

const BLOCKING_IMPACT_AREAS: AssumptionImpactArea[] = [
  "cost",
  "merge_safety",
  "privacy",
  "release_status",
];

export function buildAssumptionRecord(input: Partial<AgentAssumptionRecord> = {}): AgentAssumptionRecord {
  const impactAreas = normalizedImpactAreas(input.impactAreas);
  return {
    alternativesSkipped: cleanList(input.alternativesSkipped),
    assumptions: cleanList(input.assumptions),
    checksRun: cleanList(input.checksRun),
    checksSkipped: cleanList(input.checksSkipped),
    confidence: input.confidence ?? "low",
    defaultsUsed: cleanList(input.defaultsUsed),
    humanQuestions: cleanList(input.humanQuestions),
    impactAreas,
    notes: input.notes?.trim() || "No additional notes.",
    unresolved: input.unresolved ?? hasBlockingImpact(impactAreas),
  };
}

export function assumptionBlocksAutoMerge(record: AgentAssumptionRecord): boolean {
  return record.unresolved && hasBlockingImpact(record.impactAreas);
}

export function assumptionsBlockAutoMerge(records: AgentAssumptionRecord[] | undefined): boolean {
  return records?.some(assumptionBlocksAutoMerge) ?? false;
}

function hasBlockingImpact(impactAreas: AssumptionImpactArea[]): boolean {
  return impactAreas.some((area) => BLOCKING_IMPACT_AREAS.includes(area));
}

function normalizedImpactAreas(value: AssumptionImpactArea[] | undefined): AssumptionImpactArea[] {
  const areas = cleanList(value) as AssumptionImpactArea[];
  return areas.length > 0 ? areas : ["none"];
}

function cleanList(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))];
}
