const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const DEFAULT_GEMINI_MANAGED_AGENT_ID = "crosstube-search-agent";
const GEMINI_INTERACTIONS_API_REVISION = "2026-05-20";

interface GenerateGeminiTextInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseMimeType?: "text/plain" | "application/json";
  responseSchema?: Record<string, unknown>;
}

interface GenerateGeminiImageInput {
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  timeoutMs?: number;
}

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

export interface ManagedAgentVideoCandidate {
  id: string;
  title: string;
  creatorName?: string | null;
  description?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  topics?: string[] | null;
  viewCount?: number;
  likeCount?: number;
  updatedAt?: string;
}

const getGeminiApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  return apiKey;
};

export const generateGeminiText = async ({
  systemPrompt,
  userPrompt,
  temperature = 0.4,
  responseMimeType,
  responseSchema,
}: GenerateGeminiTextInput) => {
  const apiKey = getGeminiApiKey();
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const generationConfig: Record<string, unknown> = { temperature };

  if (responseMimeType) generationConfig.responseMimeType = responseMimeType;
  if (responseSchema) generationConfig.responseSchema = responseSchema;

  const response = await fetch(
    `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return text;
};

const findInlineData = (parts: GeminiPart[]) => {
  for (const part of parts) {
    const inlineData = part.inlineData ?? (
      part.inline_data
        ? {
            mimeType: part.inline_data.mime_type,
            data: part.inline_data.data,
          }
        : undefined
    );

    if (inlineData?.data) {
      return inlineData;
    }
  }

  return null;
};

export const generateGeminiImage = async ({
  prompt,
  aspectRatio = "16:9",
  timeoutMs = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS || "45000"),
}: GenerateGeminiImageInput) => {
  const apiKey = getGeminiApiKey();
  const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL;
  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        imageConfig: {
          aspectRatio,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini image request failed: ${errorText}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const image = findInlineData(parts);

  if (!image?.data) {
    const text = parts.map((part: GeminiPart) => part.text).filter(Boolean).join("\n").trim();
    throw new Error(`Gemini returned no image${text ? `: ${text}` : ""}`);
  }

  return {
    data: image.data,
    mimeType: image.mimeType || "image/png",
  };
};

export const getGeminiManagedAgentId = () =>
  process.env.GEMINI_MANAGED_AGENT_ID || DEFAULT_GEMINI_MANAGED_AGENT_ID;

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Managed agent returned no JSON object");
  }

  return unfenced.slice(start, end + 1);
};

export const rankVideosWithManagedAgent = async ({
  query,
  candidates,
  timeoutMs = Number(process.env.GEMINI_MANAGED_AGENT_SEARCH_TIMEOUT_MS || "1500"),
}: {
  query: string;
  candidates: ManagedAgentVideoCandidate[];
  timeoutMs?: number;
}) => {
  if (candidates.length === 0) {
    return {
      agentId: getGeminiManagedAgentId(),
      rankedIds: [],
      notes: {},
    };
  }

  const apiKey = getGeminiApiKey();
  const agentId = getGeminiManagedAgentId();
  const response = await fetch(`${GEMINI_API_BASE}/interactions`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "Api-Revision": GEMINI_INTERACTIONS_API_REVISION,
    },
    body: JSON.stringify({
      agent: agentId,
      input: [
        "Rank these CrossTube videos for the viewer's search query.",
        "Return ONLY JSON with this shape:",
        "{\"rankedIds\":[\"video-id\"],\"queryIntent\":\"short intent\",\"reasonById\":{\"video-id\":\"short reason\"}}",
        "Use only the candidate IDs provided. Include every relevant candidate once, best first.",
        "",
        JSON.stringify({ query, candidates }, null, 2),
      ].join("\n"),
      system_instruction: [
        "You are CrossTube's managed search ranking agent.",
        "Rank videos by semantic relevance, title/description match, creator match, freshness, and engagement.",
        "Prefer exact intent matches over popularity. Never invent video IDs. Return only valid JSON.",
      ].join(" "),
      environment: "remote",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini managed agent request failed: ${errorText}`);
  }

  const data = await response.json();
  const outputText = String(
    data.output_text ??
      data.outputText ??
      data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text)
        .filter(Boolean)
        .join("\n") ??
      "",
  );

  if (!outputText) {
    throw new Error("Gemini managed agent returned an empty response");
  }

  const parsed = JSON.parse(extractJsonObject(outputText)) as {
    rankedIds?: unknown;
    ranked_ids?: unknown;
    queryIntent?: unknown;
    query_intent?: unknown;
    reasonById?: unknown;
    reason_by_id?: unknown;
  };
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const rawRankedIds = parsed.rankedIds ?? parsed.ranked_ids;
  const rankedIds = Array.isArray(rawRankedIds)
    ? rawRankedIds.filter((id): id is string => typeof id === "string" && candidateIds.has(id))
    : [];

  return {
    agentId,
    rankedIds,
    notes: {
      queryIntent: parsed.queryIntent ?? parsed.query_intent ?? null,
      reasonById: parsed.reasonById ?? parsed.reason_by_id ?? {},
    },
  };
};

export interface GeminiVideoMetadata {
  title: string;
  description: string;
  summary: string;
  tags: string[];
  topics: string[];
  category: string;
  language: string;
  safety: {
    label: "safe" | "review";
    reason: string;
  };
}

const METADATA_SYSTEM_PROMPT = `You are CrossTube's AI video producer.
Given a video's existing title, description and transcript, return rich publishing metadata.
- "title": 3-8 words, search friendly, no clickbait, no emojis.
- "description": 2-4 sentences, factual, under 500 characters.
- "summary": 1-2 sentence highlight summary used in search results.
- "tags": 3-8 short, lowercase, hyphen-separated keywords.
- "topics": 2-5 high level topic names (Title Case).
- "category": one of the provided categories if any fits, otherwise the best single word.
- "language": ISO 639-1 code of the dominant spoken/written language.
- "safety.label": "safe" unless the video clearly needs human review.
- "safety.reason": one sentence reason.
Return ONLY valid JSON matching the schema. Never quote source material verbatim.`;

const METADATA_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    topics: { type: "array", items: { type: "string" } },
    category: { type: "string" },
    language: { type: "string" },
    safety: {
      type: "object",
      properties: {
        label: { type: "string", enum: ["safe", "review"] },
        reason: { type: "string" },
      },
      required: ["label", "reason"],
    },
  },
  required: [
    "title",
    "description",
    "summary",
    "tags",
    "topics",
    "category",
    "language",
    "safety",
  ],
};

export const generateGeminiVideoMetadata = async ({
  context,
  categoryNames,
}: {
  context: string;
  categoryNames: string[];
}) => {
  const userPrompt = [
    "Available categories:",
    categoryNames.length > 0 ? categoryNames.join(", ") : "(none)",
    "",
    "Video context:",
    context,
  ].join("\n");

  const raw = await generateGeminiText({
    systemPrompt: METADATA_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    responseMimeType: "application/json",
    responseSchema: METADATA_RESPONSE_SCHEMA,
  });

  try {
    return JSON.parse(raw) as GeminiVideoMetadata;
  } catch (error) {
    throw new Error(`Gemini metadata JSON parse failed: ${(error as Error).message}`);
  }
};

export const buildSearchDocument = ({
  title,
  creatorName,
  description,
  summary,
  tags,
  topics,
  transcript,
}: {
  title: string;
  creatorName?: string | null;
  description?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  topics?: string[] | null;
  transcript?: string | null;
}) =>
  [
    `title: ${title}`,
    creatorName ? `creator: ${creatorName}` : null,
    description ? `description: ${description}` : null,
    summary ? `summary: ${summary}` : null,
    tags?.length ? `tags: ${tags.join(", ")}` : null,
    topics?.length ? `topics: ${topics.join(", ")}` : null,
    transcript ? `transcript: ${transcript.slice(0, 4000)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

export const cosineSimilarity = (a: number[], b: number[]) => {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const createGeminiEmbedding = async (text: string) => {
  const apiKey = getGeminiApiKey();
  const model = process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${model}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini embedding request failed: ${errorText}`);
  }

  const data = await response.json();
  return data.embedding?.values as number[] | undefined;
};
