import { describe, expect, it } from "vitest";
import { SelfHealAgent } from "./self-heal-agent";

describe("SelfHealAgent", () => {
  it("classifies locator failures", () => {
    const agent = new SelfHealAgent();
    const signature = agent.classify("locator not found for button");
    expect(signature.type).toBe("locator");
  });

  it("applies best patch and keeps valid script", () => {
    const agent = new SelfHealAgent();
    const candidates = agent.generateCandidates(
      { type: "timing", reason: "timeout" },
      { flowHealingEnabled: true }
    );
    const result = agent.applyBestPatch({
      script: 'await helpers.assertTextVisible(page, "ok");',
      targetUrl: "https://example.com",
      candidates
    });
    expect(result.validation.valid).toBe(true);
  });
});

