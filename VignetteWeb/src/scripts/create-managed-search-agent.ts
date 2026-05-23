import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const API_REVISION = "2026-05-20";
const DEFAULT_AGENT_ID = "crosstube-search-agent";
const DEFAULT_BASE_AGENT = "antigravity-preview-05-2026";

const getApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  return apiKey;
};

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": getApiKey(),
      "Api-Revision": API_REVISION,
      ...init?.headers,
    },
  });

  return response;
};

async function main() {
  const agentId = process.env.GEMINI_MANAGED_AGENT_ID || DEFAULT_AGENT_ID;
  const baseAgent = process.env.GEMINI_MANAGED_AGENT_BASE_AGENT || DEFAULT_BASE_AGENT;
  const getResponse = await request(`${GEMINI_API_BASE}/agents/${agentId}`);

  if (getResponse.ok) {
    console.log(`Managed search agent already exists: ${agentId}`);
    return;
  }

  if (getResponse.status !== 404) {
    const errorText = await getResponse.text();
    throw new Error(`Failed to check managed agent (${getResponse.status}): ${errorText}`);
  }

  const createResponse = await request(`${GEMINI_API_BASE}/agents`, {
    method: "POST",
    body: JSON.stringify({
      id: agentId,
      description: "Ranks CrossTube video search candidates by semantic relevance.",
      base_agent: baseAgent,
      system_instruction: [
        "You are CrossTube's managed search ranking agent.",
        "Given a viewer query and candidate videos, return only JSON.",
        "Rank by semantic relevance, exact title/description match, creator match, freshness, and engagement.",
        "Use only IDs supplied in the prompt. Never invent IDs.",
      ].join(" "),
      base_environment: {
        type: "remote",
      },
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create managed search agent (${createResponse.status}): ${errorText}`);
  }

  console.log(`Created managed search agent: ${agentId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
