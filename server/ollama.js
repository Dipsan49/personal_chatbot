export class OllamaError extends Error {
  constructor(message, { code = "OLLAMA_ERROR", status = 500 } = {}) {
    super(message);
    this.name = "OllamaError";
    this.code = code;
    this.status = status;
  }
}

function modelIsAvailable(models, requestedModel) {
  return models.some(({ name, model }) => {
    const installedName = name || model || "";
    return (
      installedName === requestedModel ||
      (!requestedModel.includes(":") &&
        installedName.startsWith(`${requestedModel}:`))
    );
  });
}

export class OllamaClient {
  constructor({
    baseUrl = "http://127.0.0.1:11434",
    chatModel = "qwen3.5:4b",
    embeddingModel = "embeddinggemma",
    apiKey,
    fetchFn = fetch,
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.chatModel = chatModel;
    this.embeddingModel = embeddingModel;
    this.apiKey = apiKey;
    this.fetch = fetchFn;
  }

  requestHeaders() {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey
        ? { Authorization: `Bearer ${this.apiKey}` }
        : {}),
    };
  }

  async status() {
    try {
      const response = await this.fetch(`${this.baseUrl}/api/tags`, {
        headers: this.requestHeaders(),
        signal: AbortSignal.timeout(2500),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}.`);
      }

      const payload = await response.json();
      const models = Array.isArray(payload.models) ? payload.models : [];
      const requiredModels = [this.chatModel, this.embeddingModel].filter(Boolean);
      const missingModels = requiredModels.filter(
        (model) => !modelIsAvailable(models, model),
      );

      return {
        ready: missingModels.length === 0,
        reachable: true,
        missingModels,
      };
    } catch {
      return {
        ready: false,
        reachable: false,
        missingModels: [this.chatModel, this.embeddingModel].filter(Boolean),
      };
    }
  }

  async assertReady() {
    const currentStatus = await this.status();

    if (!currentStatus.reachable) {
      throw new OllamaError(
        "The AI service is temporarily unavailable.",
        { code: "OLLAMA_UNAVAILABLE", status: 503 },
      );
    }

    if (currentStatus.missingModels.length) {
      throw new OllamaError(
        `Configured models are unavailable: ${currentStatus.missingModels.join(", ")}.`,
        { code: "OLLAMA_MODELS_MISSING", status: 503 },
      );
    }
  }

  async embed(inputs, { signal } = {}) {
    if (!this.embeddingModel) {
      throw new OllamaError("No embedding model is configured.");
    }

    const response = await this.fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: this.requestHeaders(),
      body: JSON.stringify({
        model: this.embeddingModel,
        input: inputs,
        truncate: true,
        keep_alive: "15m",
      }),
      signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new OllamaError(
        payload.error || `Embedding request failed with HTTP ${response.status}.`,
        { status: response.status },
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload.embeddings)) {
      throw new OllamaError("Ollama returned an invalid embedding response.");
    }

    return payload.embeddings;
  }

  async *streamChat({ messages, system, signal }) {
    const response = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: this.requestHeaders(),
      body: JSON.stringify({
        model: this.chatModel,
        messages: [{ role: "system", content: system }, ...messages],
        stream: true,
        think: false,
        keep_alive: "15m",
        options: {
          temperature: 0.15,
          top_p: 0.9,
          repeat_penalty: 1.08,
          num_ctx: 8192,
          num_predict: 360,
        },
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new OllamaError(
        payload.error || `Generation request failed with HTTP ${response.status}.`,
        { status: response.status },
      );
    }

    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const payload = JSON.parse(line);
        if (payload.error) throw new OllamaError(payload.error);
        if (payload.message?.content) yield payload.message.content;
      }
    }

    if (buffer.trim()) {
      const payload = JSON.parse(buffer);
      if (payload.error) throw new OllamaError(payload.error);
      if (payload.message?.content) yield payload.message.content;
    }
  }
}
