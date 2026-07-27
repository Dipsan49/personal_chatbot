import test from "node:test";
import assert from "node:assert/strict";
import { OllamaClient } from "./ollama.js";

test("reports ready when both local models are installed", async () => {
  const client = new OllamaClient({
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          models: [
            { name: "qwen3.5:4b" },
            { name: "embeddinggemma:latest" },
          ],
        }),
      ),
  });

  const status = await client.status();
  assert.equal(status.ready, true);
  assert.deepEqual(status.missingModels, []);
});

test("authenticates cloud requests without exposing the key in the body", async () => {
  const client = new OllamaClient({
    baseUrl: "https://ollama.com",
    chatModel: "gpt-oss:20b",
    embeddingModel: null,
    apiKey: "test-secret",
    fetchFn: async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer test-secret");
      return new Response(
        JSON.stringify({ models: [{ model: "gpt-oss:20b" }] }),
      );
    },
  });

  const status = await client.status();
  assert.equal(status.ready, true);
});

test("returns local embeddings", async () => {
  const client = new OllamaClient({
    fetchFn: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.model, "embeddinggemma");
      assert.deepEqual(request.input, ["resume section", "user question"]);
      return new Response(JSON.stringify({ embeddings: [[1, 0], [0, 1]] }));
    },
  });

  const embeddings = await client.embed(["resume section", "user question"]);
  assert.deepEqual(embeddings, [[1, 0], [0, 1]]);
});

test("streams answer text from Ollama NDJSON", async () => {
  const body = [
    JSON.stringify({ message: { content: "Dipsan " }, done: false }),
    JSON.stringify({ message: { content: "researches edge AI." }, done: false }),
    JSON.stringify({ done: true }),
  ].join("\n");
  const client = new OllamaClient({
    fetchFn: async () => new Response(body),
  });

  let answer = "";
  for await (const delta of client.streamChat({
    messages: [{ role: "user", content: "What does he research?" }],
    system: "Use the resume.",
  })) {
    answer += delta;
  }

  assert.equal(answer, "Dipsan researches edge AI.");
});
