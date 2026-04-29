import { PatchType } from "@agent/contracts";
import { randomUUID } from "node:crypto";

export type FailureSignature = {
  type: PatchType;
  reason: string;
};

export type CandidatePatch = {
  id: string;
  type: PatchType;
  description: string;
  score: number;
  apply: (script: string, context: { targetUrl?: string }) => string;
};

function compileScript(script: string): { valid: boolean; error?: string } {
  try {
    // eslint-disable-next-line no-new-func
    new Function("page", "helpers", "ctx", `return (async () => { ${script} })();`);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

function insertBeforeActions(script: string, injection: string): string {
  return script.replace(
    /await helpers\.(clickByText|fillByLabelOrPlaceholder|assertTextVisible|assertTextContainsLoose)\(/g,
    `${injection}\nawait helpers.$1(`
  );
}

export class SelfHealAgent {
  classify(errorMessage: string): FailureSignature {
    const message = errorMessage.toLowerCase();
    if (
      message.includes("err_cert") ||
      message.includes("certificate") ||
      message.includes("ssl") ||
      message.includes("tls")
    ) {
      return { type: "flow", reason: "TLS certificate validation failed" };
    }
    if (message.includes("locator") || message.includes("not found") || message.includes("no element")) {
      return { type: "locator", reason: "Element locator likely drifted" };
    }
    if (message.includes("timeout") || message.includes("waiting")) {
      return { type: "timing", reason: "Timing instability detected" };
    }
    if (message.includes("assert") || message.includes("expect")) {
      return { type: "assertion", reason: "Assertion mismatch detected" };
    }
    if (message.includes("navigation") || message.includes("url")) {
      return { type: "flow", reason: "Flow path diverged from expected path" };
    }
    return { type: "unknown", reason: "Unknown execution failure pattern" };
  }

  generateCandidates(
    signature: FailureSignature,
    options: { flowHealingEnabled: boolean }
  ): CandidatePatch[] {
    const candidates: CandidatePatch[] = [];
    const certFailure = signature.reason.toLowerCase().includes("certificate");

    candidates.push({
      id: randomUUID(),
      type: "timing",
      description: "Inject pre-action stabilization waits",
      score: signature.type === "timing" ? 0.95 : 0.5,
      apply: (script) => insertBeforeActions(script, "await helpers.waitStable(page, 1000);")
    });

    candidates.push({
      id: randomUUID(),
      type: "locator",
      description: "Switch clicks to fallback locator strategy",
      score: signature.type === "locator" ? 0.96 : 0.45,
      apply: (script) => script.replace(/helpers\.clickByText\(/g, "helpers.clickWithFallback(")
    });

    candidates.push({
      id: randomUUID(),
      type: "assertion",
      description: "Relax text assertion to contains matching",
      score: signature.type === "assertion" ? 0.92 : 0.4,
      apply: (script) => script.replace(/helpers\.assertTextVisible\(/g, "helpers.assertTextContainsLoose(")
    });

    if (options.flowHealingEnabled) {
      candidates.push({
        id: randomUUID(),
        type: "flow",
        description: certFailure
          ? "Downgrade https links to http for self-signed cert environments"
          : "Ensure landing URL and refresh before assertions",
        score: certFailure
          ? 0.99
          : (signature.type === "flow" ? 0.97 : 0.6),
        apply: (script, context) => {
          if (certFailure) {
            const target = context.targetUrl ?? "";
            const downgradeTarget = target.startsWith("https://")
              ? target.replace(/^https:\/\//i, "http://")
              : target;
            return script
              .replaceAll("https://", "http://")
              .replace(`await helpers.gotoSafe(page, ctx.targetUrl);`, `await helpers.gotoSafe(page, "${downgradeTarget}");`);
          }
          const ensureUrlLine = `await helpers.ensureAtUrl(page, "${context.targetUrl ?? ""}");`;
          const refreshLine = "await helpers.refreshAndWait(page);";
          return `${ensureUrlLine}\n${script.replace(
            /await helpers\.(assertTextVisible|assertTextContainsLoose)\(/,
            `${refreshLine}\nawait helpers.$1(`
          )}`;
        }
      });
    }

    if (options.flowHealingEnabled) {
      candidates.push({
        id: randomUUID(),
        type: "flow",
        description: "Ensure landing URL and refresh before assertions",
        score: signature.type === "flow" ? 0.85 : 0.55,
        apply: (script, context) => {
          const ensureUrlLine = `await helpers.ensureAtUrl(page, "${context.targetUrl ?? ""}");`;
          const refreshLine = "await helpers.refreshAndWait(page);";
          return `${ensureUrlLine}\n${script.replace(
            /await helpers\.(assertTextVisible|assertTextContainsLoose)\(/,
            `${refreshLine}\nawait helpers.$1(`
          )}`;
        }
      });
    }

    return candidates.sort((a, b) => b.score - a.score);
  }

  applyBestPatch(input: {
    script: string;
    targetUrl?: string;
    candidates: CandidatePatch[];
  }): {
    patchedScript: string;
    chosenPatch: CandidatePatch;
    validation: { valid: boolean; error?: string };
  } {
    const chosenPatch = input.candidates[0];
    const patchedScript = chosenPatch.apply(input.script, { targetUrl: input.targetUrl });
    const validation = compileScript(patchedScript);
    return {
      patchedScript,
      chosenPatch,
      validation
    };
  }
}
