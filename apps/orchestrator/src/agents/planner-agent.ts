import { KnowledgeDoc, TestPlan, TestPlanSchema } from "@agent/contracts";
import { randomUUID } from "node:crypto";
import { ChatMessage, LlmClient } from "../services/llm-client";

const VALID_ACTIONS = new Set(["navigate", "click", "input", "assert", "wait", "custom"]);

function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : undefined;
}

function normalizeText(text: string): string {
  return text.replace(/[。；;]+/g, "\n").replace(/\r/g, "").trim();
}

function parseStep(line: string): TestPlan["steps"][number] {
  const trimmed = line.replace(/^\d+[\.\)、\s]*/, "").trim();
  const lower = trimmed.toLowerCase();

  if (/打开|访问|进入|navigate|open/.test(lower)) {
    return { id: randomUUID(), title: trimmed, action: "navigate" };
  }
  if (/点击|click|tap/.test(lower)) {
    const target = trimmed
      .replace(/.*(点击|click)\s*/i, "")
      .replace(/[“”"']/g, "")
      .trim();
    return { id: randomUUID(), title: trimmed, action: "click", target: target || undefined };
  }
  if (/输入|填写|fill|type/.test(lower)) {
    const valueMatch = trimmed.match(/["“](.+?)["”]/);
    return {
      id: randomUUID(),
      title: trimmed,
      action: "input",
      value: valueMatch?.[1]
    };
  }
  if (/检查|验证|断言|assert|verify/.test(lower)) {
    return { id: randomUUID(), title: trimmed, action: "assert", assertion: trimmed };
  }
  if (/等待|wait/.test(lower)) {
    return { id: randomUUID(), title: trimmed, action: "wait" };
  }
  return { id: randomUUID(), title: trimmed, action: "custom" };
}

function heuristicPlan(input: {
  requirement: string;
  targetUrl?: string;
  knowledge: KnowledgeDoc[];
}): TestPlan {
  const normalized = normalizeText(input.requirement);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const stepLines = lines.filter((line) =>
    /\d+[\.\)、]|打开|访问|点击|输入|检查|验证|等待|open|click|fill|assert/i.test(line)
  );
  const derivedSteps = (stepLines.length > 0 ? stepLines : ["打开目标页面", "检查页面主区域可见"]).map(parseStep);

  const hints = input.knowledge
    .slice(0, 2)
    .map((doc) => doc.content)
    .join(" ");
  if (hints && !derivedSteps.some((step) => step.action === "wait")) {
    derivedSteps.splice(1, 0, {
      id: randomUUID(),
      title: "等待页面稳定加载（来自历史经验）",
      action: "wait"
    });
  }

  return TestPlanSchema.parse({
    objective: lines[0] ?? "执行自动化测试",
    targetUrl: input.targetUrl ?? extractUrl(input.requirement),
    steps: derivedSteps
  });
}

function extractJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const codeBlock = content.match(/```json\s*([\s\S]*?)```/i) ?? content.match(/```\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) {
      return JSON.parse(codeBlock[1]);
    }
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Planner response is not valid JSON");
  }
}

function compactError(error: unknown): string {
  const message = (error as Error).message ?? "unknown";
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

function inferActionFromText(text: string): string {
  const lower = text.toLowerCase();
  if (/打开|访问|进入|navigate|open/.test(lower)) {
    return "navigate";
  }
  if (/点击|click|tap/.test(lower)) {
    return "click";
  }
  if (/输入|填写|fill|type/.test(lower)) {
    return "input";
  }
  if (/检查|验证|断言|assert|verify/.test(lower)) {
    return "assert";
  }
  if (/等待|wait/.test(lower)) {
    return "wait";
  }
  return "custom";
}

function normalizePlanFromLlm(raw: unknown, input: { requirement: string; targetUrl?: string }): unknown {
  const source = (raw ?? {}) as Record<string, unknown>;
  const stepLike = Array.isArray(source.steps) ? source.steps : [];

  const steps = stepLike.map((item, index) => {
    const step = (item ?? {}) as Record<string, unknown>;
    const title = String(step.title ?? step.name ?? step.description ?? `step_${index + 1}`);
    const rawAction = String(step.action ?? "").toLowerCase();
    const action = VALID_ACTIONS.has(rawAction) ? rawAction : inferActionFromText(title);

    return {
      id: String(step.id ?? randomUUID()),
      title,
      action,
      target: step.target == null ? undefined : String(step.target),
      value: step.value == null ? undefined : String(step.value),
      assertion: step.assertion == null ? undefined : String(step.assertion)
    };
  });

  return {
    objective: String(source.objective ?? source.goal ?? input.requirement),
    targetUrl: source.targetUrl ?? source.url ?? input.targetUrl,
    steps
  };
}

export class PlannerAgent {
  constructor(private readonly options: { llmClient: LlmClient }) {}

  async plan(input: {
    requirement: string;
    targetUrl?: string;
    knowledge: KnowledgeDoc[];
  }): Promise<{ plan: TestPlan; reason: string }> {
    if (!this.options.llmClient.isConfigured()) {
      return {
        plan: heuristicPlan(input),
        reason: "no_llm_key_fallback"
      };
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a test planning agent. Return only a valid JSON object with keys: objective, targetUrl, steps. steps must be an array of {id,title,action,target,value,assertion}. action must be one of navigate,click,input,assert,wait,custom."
      },
      {
        role: "user",
        content: JSON.stringify(input)
      }
    ];

    try {
      const content = await this.options.llmClient.complete(messages, {
        expectJson: true,
        maxTokens: 2048
      });
      const parsed = extractJson(content);
      const normalized = normalizePlanFromLlm(parsed, input);
      return {
        plan: TestPlanSchema.parse(normalized),
        reason: "llm_plan"
      };
    } catch (error) {
      return {
        plan: heuristicPlan(input),
        reason: `llm_failed_fallback:${compactError(error)}`
      };
    }
  }
}
