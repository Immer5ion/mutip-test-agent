import { RunDetailResponse } from "@agent/contracts";
import { RunStore } from "../store/run-store";

export class LearningAgent {
  constructor(private readonly store: RunStore) {}

  ingest(detail: RunDetailResponse): void {
    this.store.addKnowledgeDoc({
      runId: detail.run.id,
      kind: "history",
      content: [
        `requirement=${detail.run.requirement}`,
        `status=${detail.run.status}`,
        `error=${detail.run.lastError ?? "none"}`
      ].join(" | "),
      metadata: {
        targetUrl: detail.run.targetUrl,
        updatedAt: detail.run.updatedAt
      }
    });

    if (detail.run.lastError) {
      this.store.addKnowledgeDoc({
        runId: detail.run.id,
        kind: "failure",
        content: detail.run.lastError,
        metadata: {
          patchCount: detail.patches.length
        }
      });
    }

    for (const patch of detail.patches) {
      this.store.addKnowledgeDoc({
        runId: detail.run.id,
        kind: "patch",
        content: `${patch.failureSignature.type}: ${patch.applyDecision.patchType} => ${patch.applyDecision.success}`,
        metadata: patch
      });
    }
  }
}

