import type { SkillsConfig } from "./schemas";

export const defaultSkillsConfig: SkillsConfig = {
  locatorStrategies: [
    "getByRole",
    "getByLabel",
    "getByPlaceholder",
    "getByText",
    "css-fallback"
  ],
  assertionStrategies: [
    "strict-visible",
    "contains-loose"
  ],
  stabilityRules: {
    defaultWaitMs: 800,
    maxRetriesPerStep: 2
  },
  selfHeal: {
    enableRuleHealing: true,
    enableFlowHealing: true
  }
};

