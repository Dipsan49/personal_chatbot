import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const localKnowledgePath = resolve(
  import.meta.dirname,
  "..",
  "knowledge",
  "resume.md",
);
let knowledgePromise;
let embeddedKnowledgePromise;

function getKnowledgePath() {
  return process.env.RESUME_PATH
    ? resolve(process.env.RESUME_PATH)
    : localKnowledgePath;
}

async function readKnowledge() {
  const inlineResume = process.env.RESUME_CONTENT?.trim();
  return inlineResume || readFile(getKnowledgePath(), "utf8");
}

function normaliseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function tokenise(value) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function cosineSimilarity(left, right) {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function lexicalScore(query, content) {
  const queryTokens = tokenise(query);
  const contentTokens = tokenise(content);
  if (!queryTokens.size) return 0;

  let matches = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) matches += 1;
  }
  return matches / queryTokens.size;
}

function queryVariants(query) {
  const variants = query
    .split(/\s+(?:and|also|plus)\s+|[,;]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);

  return [...new Set([query.trim(), ...variants])];
}

function intentBoost(query, title) {
  const normalisedQuery = query.toLowerCase();
  const normalisedTitle = title.toLowerCase();
  const asksForPersonalInterests =
    /hobby|hobbies|interest|football|arsenal|cricket|music|outside work|free time|for fun/.test(
      normalisedQuery,
    );
  let boost = 0;

  if (
    /skill|technolog|tool|stack|language|framework|database|cloud/.test(
      normalisedQuery,
    ) &&
    normalisedTitle === "technical skills"
  ) {
    boost += 0.26;
  }

  if (
    /research|edge|federated|fine.tun|on.device/.test(normalisedQuery) &&
    normalisedTitle.includes("research assistant")
  ) {
    boost += 0.24;
  }

  if (
    /current|currently|right now|present role|what do you do|what are you doing/.test(
      normalisedQuery,
    ) && !asksForPersonalInterests &&
    normalisedTitle.includes("research assistant")
  ) {
    boost += 0.32;
  }

  if (
    /project|built|build|created|portfolio/.test(normalisedQuery) &&
    normalisedTitle.startsWith("project")
  ) {
    boost += 0.18;
  }

  if (
    /education|degree|study|student|grade|gpa/.test(normalisedQuery) &&
    normalisedTitle.startsWith("education")
  ) {
    boost += 0.2;
  }

  if (
    asksForPersonalInterests &&
    normalisedTitle.startsWith("personal interests")
  ) {
    boost += 0.3;
  }

  const asksForCredentials =
    /certif|credential|membership|club|qualification|course/.test(
      normalisedQuery,
    );
  if (normalisedTitle === "certifications and memberships") {
    boost += asksForCredentials ? 0.26 : -0.18;
  }

  const asksForContact =
    /contact|email|phone|linkedin|github|location|based|melbourne/.test(
      normalisedQuery,
    );
  if (normalisedTitle === "dipsan bhattarai") {
    boost += asksForContact ? 0.3 : -0.3;
  }

  return boost;
}

export async function loadKnowledge() {
  if (!knowledgePromise) {
    knowledgePromise = readKnowledge().then((resume) => {
      const sections = resume
        .split(/\n(?=## )/)
        .map((section, index) => {
          const lines = section.trim().split("\n");
          const title = lines[0].replace(/^#+\s*/, "");
          return {
            id: `resume-${index + 1}`,
            title,
            content: normaliseWhitespace(section),
          };
        })
        .filter((section) => section.content.length > 40);

      return { raw: resume, sections };
    });
  }

  return knowledgePromise;
}

async function getEmbeddedKnowledge(embed) {
  if (!embeddedKnowledgePromise) {
    embeddedKnowledgePromise = loadKnowledge()
      .then(async ({ sections }) => {
        const embeddings = await embed(
          sections.map((section) => section.content),
        );

        return sections.map((section, index) => ({
          ...section,
          embedding: embeddings[index],
        }));
      })
      .catch((error) => {
        embeddedKnowledgePromise = undefined;
        throw error;
      });
  }

  return embeddedKnowledgePromise;
}

export function rankLexically(query, sections, limit = 4) {
  return sections
    .map((section) => ({
      ...section,
      score: lexicalScore(query, section.content),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function retrieveResumeContext({
  embed,
  query,
  limit = 4,
}) {
  const variants = queryVariants(query);

  if (!embed) {
    const { sections } = await loadKnowledge();
    return sections
      .map((section) => {
        const lexical = Math.max(
          ...variants.map((variant) => lexicalScore(variant, section.content)),
        );
        const intent = intentBoost(query, section.title);
        return {
          ...section,
          score: lexical + intent,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  const [embeddedSections, queryEmbeddings] = await Promise.all([
    getEmbeddedKnowledge(embed),
    embed(variants),
  ]);

  return embeddedSections
    .map((section) => {
      const semantic = Math.max(
        ...queryEmbeddings.map((embedding) =>
          cosineSimilarity(embedding, section.embedding),
        ),
      );
      const lexical = Math.max(
        ...variants.map((variant) => lexicalScore(variant, section.content)),
      );
      const intent = intentBoost(query, section.title);
      return {
        id: section.id,
        title: section.title,
        content: section.content,
        score: semantic * 0.82 + lexical * 0.18 + intent,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
