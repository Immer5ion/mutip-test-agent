export type ExecuteRequest = {
  runId: string;
  attemptNo: number;
  targetUrl?: string;
  requirement: string;
  script: string;
};

export type ExecuteResponse = {
  passed: boolean;
  startedAt: string;
  endedAt: string;
  logs: string[];
  screenshots: string[];
  tracePath?: string;
  error?: string;
};

export class ExecutorClient {
  constructor(private readonly baseUrl: string) {}

  async execute(payload: ExecuteRequest): Promise<ExecuteResponse> {
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-run-id": payload.runId
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Executor failed: ${response.status} ${body}`);
    }

    return (await response.json()) as ExecuteResponse;
  }
}

