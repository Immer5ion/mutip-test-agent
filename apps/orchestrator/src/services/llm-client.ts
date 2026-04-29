export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatCompletionOptions = {
  expectJson?: boolean;
  maxTokens?: number;
};

export interface LlmClient {
  isConfigured(): boolean;
  complete(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string>;
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractContent(payload: unknown): string | undefined {
  const data = payload as Record<string, unknown>;
  const choices = data.choices as unknown[] | undefined;
  const firstChoice = choices?.[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (typeof content === "string") {
    if (content.trim().length > 0) {
      return content.trim();
    }
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          const maybeText = (part as Record<string, unknown>).text;
          if (typeof maybeText === "string") {
            return maybeText;
          }
        }
        return "";
      })
      .join("");
    if (text.trim().length > 0) {
      return text.trim();
    }
  }

  const reasoningContent = message?.reasoning_content;
  if (typeof reasoningContent === "string" && reasoningContent.trim().length > 0) {
    return reasoningContent.trim();
  }

  const outputText = data.output_text;
  if (typeof outputText === "string") {
    return outputText.trim();
  }
  return undefined;
}

function extractContentFromSse(raw: string): string | undefined {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));
  const chunks: string[] = [];

  for (const line of lines) {
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }
    try {
      const data = JSON.parse(payload) as Record<string, unknown>;
      const choices = data.choices as unknown[] | undefined;
      const firstChoice = choices?.[0] as Record<string, unknown> | undefined;
      const delta = firstChoice?.delta as Record<string, unknown> | undefined;
      const deltaContent = delta?.content;

      if (typeof deltaContent === "string" && deltaContent.length > 0) {
        chunks.push(deltaContent);
      } else if (Array.isArray(deltaContent)) {
        for (const part of deltaContent) {
          if (typeof part === "string") {
            chunks.push(part);
          } else if (part && typeof part === "object") {
            const text = (part as Record<string, unknown>).text;
            if (typeof text === "string") {
              chunks.push(text);
            }
          }
        }
      }
    } catch {
      // Ignore malformed SSE chunks.
    }
  }

  const merged = chunks.join("").trim();
  return merged.length > 0 ? merged : undefined;
}

export class HttpLlmClient implements LlmClient {
  private static nextAllowedRequestAt = 0;

  constructor(
    private readonly options: {
      apiUrl: string;
      apiKey?: string;
      model: string;
      thinkingEnabled: boolean;
      stream: boolean;
      maxTokens: number;
      temperature: number;
      timeoutMs: number;
      retryCount: number;
      minIntervalMs: number;
    }
  ) {}

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  async complete(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    if (!this.options.apiKey) {
      throw new Error("LLM API key is missing");
    }

    const maxAttempts = Math.max(1, this.options.retryCount + 1);
    let lastError = "Unknown LLM error";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const payload: Record<string, unknown> = {
        model: this.options.model,
        messages,
        stream: this.options.stream,
        max_tokens: options.maxTokens ?? this.options.maxTokens,
        temperature: this.options.temperature
      };

      if (this.options.thinkingEnabled) {
        payload.thinking = {
          type: "enabled"
        };
      }
      if (options.expectJson) {
        payload.response_format = {
          type: "json_object"
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

      try {
        const now = Date.now();
        if (now < HttpLlmClient.nextAllowedRequestAt) {
          await sleep(HttpLlmClient.nextAllowedRequestAt - now);
        }

        const response = await fetch(this.options.apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.options.apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          const body = await response.text();
          lastError = `LLM API failed: status=${response.status} body=${body.slice(0, 600)}`;
          const retryAfter = response.headers.get("retry-after");
          const retryAfterMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 0;
          HttpLlmClient.nextAllowedRequestAt = Date.now() + Math.max(this.options.minIntervalMs, retryAfterMs);
          if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts) {
            await sleep(Math.max(1200 * attempt, retryAfterMs));
            continue;
          }
          throw new Error(lastError);
        }

        HttpLlmClient.nextAllowedRequestAt = Date.now() + this.options.minIntervalMs;
        const raw = await response.text();
        const data = this.options.stream
          ? extractContentFromSse(raw)
          : extractContent(JSON.parse(raw) as unknown);
        if (!data || data.trim().length === 0) {
          lastError = `LLM response missing content. raw=${raw.slice(0, 600)}`;
          throw new Error(lastError);
        }
        return data;
      } catch (error) {
        const message = (error as Error).message;
        if (message.includes("aborted")) {
          lastError = `LLM timeout after ${this.options.timeoutMs}ms`;
        } else if (message) {
          lastError = message;
        }
        if (attempt < maxAttempts) {
          await sleep(800 * attempt);
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(lastError);
  }
}
