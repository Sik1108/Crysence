export const RECORDING_DURATION_SECONDS = 5;
export const RELIABLE_CONFIDENCE_THRESHOLD = 0.75;
export const RELIABLE_MARGIN_THRESHOLD = 0.25;

export const CRY_REASONS = Object.freeze({
  HUNGER: "hunger",
  SLEEPY: "sleepy",
  DISCOMFORT: "discomfort"
});

export const SAFETY_STATUS = Object.freeze({
  SAFE: "safe",
  PATHOLOGICAL_RISK: "pathological_risk",
  ABNORMAL_CRY: "abnormal_cry",
  DANGER_SIGNS: "danger_signs",
  LOW_CONFIDENCE: "low_confidence",
  UNRELIABLE: "unreliable"
});

export function classifyConfidence(probabilities) {
  const sorted = [...probabilities].sort((a, b) => b - a);
  const maximum = sorted[0] ?? 0;
  const margin = maximum - (sorted[1] ?? 0);
  const reliable = maximum >= RELIABLE_CONFIDENCE_THRESHOLD * 100
    && margin >= RELIABLE_MARGIN_THRESHOLD * 100;

  if (reliable) return "high";
  if (maximum >= 55) return "medium";
  return "low";
}
