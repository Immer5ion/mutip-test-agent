import { KnowledgeDoc, TestPlan } from "@agent/contracts";
import { ChatMessage, LlmClient } from "../services/llm-client";

function escapeLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function stripCodeFence(input: string): string {
  const fenced = input.match(/```(?:javascript|js|ts)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return input.trim();
}

function heuristicGenerate(input: { plan: TestPlan }): string {
  const lines: string[] = [];
  lines.push("await helpers.gotoSafe(page, ctx.targetUrl);");
  lines.push("await helpers.waitStable(page);");

  for (const step of input.plan.steps) {
    const title = escapeLiteral(step.title);
    lines.push(`await helpers.logStep("${title}");`);
    if (step.action === "navigate") {
      lines.push("await helpers.gotoSafe(page, ctx.targetUrl);");
      continue;
    }
    if (step.action === "click") {
      const target = escapeLiteral(step.target ?? step.title);
      lines.push(`await helpers.clickByText(page, "${target}");`);
      continue;
    }
    if (step.action === "input") {
      const target = escapeLiteral(step.target ?? "输入框");
      const value = escapeLiteral(step.value ?? "test-value");
      lines.push(`await helpers.fillByLabelOrPlaceholder(page, "${target}", "${value}");`);
      continue;
    }
    if (step.action === "assert") {
      const assertion = escapeLiteral(step.assertion ?? step.title);
      lines.push(`await helpers.assertTextVisible(page, "${assertion}");`);
      continue;
    }
    if (step.action === "wait") {
      lines.push("await helpers.waitStable(page, 1200);");
      continue;
    }
    lines.push("await helpers.waitStable(page, 500);");
  }

  lines.push('await helpers.captureStep(page, "final");');
  return lines.join("\n");
}

function validateGeneratedScript(script: string): void {
  const trimmed = script.trim();
  if (!trimmed) {
    throw new Error("Generated script is empty");
  }
  const forbiddenPatterns = [
    /\bimport\s+/,
    /\bdescribe\s*\(/,
    /\btest\s*\(/,
    /\bexpect\s*\(/,
    /\bplaywright\b/i
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(trimmed)) {
      throw new Error(`Generated script includes forbidden pattern: ${pattern}`);
    }
  }
  if (!trimmed.includes("helpers.") && !trimmed.includes("page.")) {
    throw new Error("Generated script does not call helpers/page");
  }
}

function compactError(error: unknown): string {
  const message = (error as Error).message ?? "unknown";
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

export class CodeGenAgent {
  constructor(private readonly options: { llmClient: LlmClient }) {}

  private buildMessages(input: { plan: TestPlan; knowledge: KnowledgeDoc[] }): ChatMessage[] {
    return [
      {
        role: "system",
        content:
          "You are a Playwright code generation agent. Return only a JavaScript function body (no markdown, no code fences). Available variables: page, helpers, ctx. Never use import/describe/test/expect."
      },
      {
        role: "user",
        content: JSON.stringify(input)
      }
    ];
  }

  async generate(input: { plan: TestPlan; knowledge: KnowledgeDoc[] }): Promise<{ script: string; reason: string }> {
    if (!this.options.llmClient.isConfigured()) {
      return {
        script: heuristicGenerate(input),
        reason: "no_llm_key_fallback"
      };
    }

    const messages = this.buildMessages(input);

    try {
      const content = await this.options.llmClient.complete(messages, { maxTokens: 4096 });
      const script = stripCodeFence(content);
      if (!script) {
        throw new Error("Empty codegen response");
      }
      validateGeneratedScript(script);
      return {
        script,
        reason: "llm_codegen"
      };
    } catch (error) {
      try {
        const retryMessages: ChatMessage[] = [
          ...messages,
          {
            role: "user",
            content: `Your previous output is invalid: ${compactError(
              error
            )}. Regenerate valid script body using only helpers/page calls.`
          }
        ];
        const retryContent = await this.options.llmClient.complete(retryMessages, { maxTokens: 4096 });
        const retryScript = stripCodeFence(retryContent);
        validateGeneratedScript(retryScript);
        return {
          script: retryScript,
          reason: "llm_codegen_retry_fixed"
        };
      } catch (retryError) {
        const mergedError = `${compactError(error)} | retry=${compactError(retryError)}`;
        return {
          script: heuristicGenerate(input),
          reason: `llm_failed_fallback:${mergedError}`
        };
      }
    }

    // unreachable; keeps TypeScript control-flow explicit
    return {
      script: heuristicGenerate(input),
      reason: "llm_failed_fallback:unknown"
    };
  }
}
