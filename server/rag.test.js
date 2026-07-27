import test from "node:test";
import assert from "node:assert/strict";
import {
  loadKnowledge,
  rankLexically,
  retrieveResumeContext,
} from "./rag.js";

test("resume knowledge is split into focused sections", async () => {
  const { sections } = await loadKnowledge();
  assert.ok(sections.length >= 12);
  assert.ok(sections.some((section) => section.title.includes("Research Assistant")));
  assert.ok(sections.some((section) => section.title.includes("SecureBank")));
});

test("lexical retrieval finds the most relevant resume passage", async () => {
  const { sections } = await loadKnowledge();
  const [result] = rankLexically(
    "What did Dipsan build with PaddleOCR for fraud detection?",
    sections,
    1,
  );
  assert.match(result.title, /AI Intern/);
  assert.match(result.content, /bank-statement processing pipeline/);
});

test("personal-interest questions retrieve Dipsan's provided hobbies", async () => {
  const { sections } = await loadKnowledge();
  const [result] = rankLexically(
    "Which football club does Dipsan support?",
    sections,
    1,
  );
  assert.match(result.title, /Personal interests and hobbies/);
  assert.match(result.content, /Arsenal/);
});

test("cloud mode retrieves resume context without an embedding model", async () => {
  const [result] = await retrieveResumeContext({
    embed: null,
    query: "What do you currently do?",
    limit: 1,
  });

  assert.match(result.title, /Research Assistant/);
  assert.match(result.content, /present/i);
});

test("undocumented technology questions retrieve technical skills for comparison", async () => {
  const [result] = await retrieveResumeContext({
    embed: null,
    query: "Do you have experience with Docker?",
    limit: 1,
  });

  assert.equal(result.title, "Technical skills");
  assert.doesNotMatch(result.content, /Docker/i);
});

test("semantic retrieval ranks embedded resume sections", async () => {
  const vectorise = (value) => {
    const text = value.toLowerCase();
    return [
      Number(/federated|edge device|on-device|pytorch/.test(text)),
      Number(/technical skills|tools|languages|databases/.test(text)),
      Number(/power apps|power automate/.test(text)),
    ];
  };
  const mockEmbedder = {
    embed: async (values) => values.map((value) => vectorise(value)),
  };

  const results = await retrieveResumeContext({
    embed: mockEmbedder.embed,
    query:
      "How does his federated learning research run on edge devices, and which tools does he use?",
    limit: 4,
  });

  assert.ok(results.some((result) => /Research Assistant/.test(result.title)));
  assert.ok(results.some((result) => /Technical skills/.test(result.title)));
});
