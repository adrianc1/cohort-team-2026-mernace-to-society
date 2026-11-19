// ==========================================
// CORE: BROWSER & STAGEHAND INITIALIZATION
// ==========================================

import { localBrowser, Stagehand } from "@browserbasehq/stagehand";

const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

/**
 * OpenRouter custom model callback for Stagehand intelligence.
 */
async function generateWithOpenRouter(params) {
  console.log("[OpenRouter] Sending inference request...");

  if (params.responseFormat?.type !== "json_schema") {
    throw new Error("Stagehand requested an unsupported response format.");
  }

  const messages = [];

  if (params.systemPrompt) {
    messages.push({
      role: "system",
      content: params.systemPrompt,
    });
  }

  for (const message of params.messages) {
    const blocks = Array.isArray(message.content)
      ? message.content
      : [message.content];

    const content = blocks.map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      if (block.type === "image") {
        return {
          type: "image_url",
          image_url: {
            url: `data:${block.mimeType};base64,${block.data}`,
          },
        };
      }
      throw new Error(`Unsupported content type: ${block.type}`);
    });

    messages.push({
      role: message.role,
      content,
    });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Universal Bill Portal Automation",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: params.temperature ?? 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: params.responseFormat.name,
          strict: true,
          schema: params.responseFormat.schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  const responseText = result.choices?.[0]?.message?.content;

  if (typeof responseText !== "string" || !responseText.trim()) {
    throw new Error("OpenRouter returned an empty response.");
  }

  let structuredContent;
  try {
    structuredContent = JSON.parse(responseText);
  } catch {
    throw new Error("OpenRouter returned invalid JSON.");
  }

  console.log("[OpenRouter] Inference successful.");

  return {
    role: "assistant",
    content: {
      type: "text",
      text: responseText,
    },
    outputFormat: "json_schema",
    structuredContent,
  };
}

/**
 * Launches the local browser and initializes Stagehand.
 */
export async function initializeBrowser() {
  console.log("\n=================================");
  console.log("STARTING BROWSER & STAGEHAND");
  console.log("=================================\n");

  let browser;
  let stagehand;

  try {
    browser = await localBrowser.launch({
      headless: false,
    });

    console.log("Browser launched successfully.");

    stagehand = await Stagehand.create({
      browser,
      model: {
        generate: generateWithOpenRouter,
      },
    });

    console.log("Stagehand initialized successfully.");

    const page = await browser.context.activePage();

    if (!page) {
      throw new Error("Could not retrieve active browser page.");
    }

    return {
      browser,
      stagehand,
      page,
    };
  } catch (error) {
    if (stagehand) {
      try { await stagehand.close(); } catch {}
    }
    if (browser) {
      try { await browser.close(); } catch {}
    }
    throw error;
  }
}