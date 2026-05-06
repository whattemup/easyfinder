/**
 * Broker proxy route — keeps the Anthropic API key server-side.
 *
 * POST /api/broker/chat
 * Body: { messages: Array<{ role: "user" | "assistant", content: string }>, listings?: string }
 *
 * Returns: { content: string }
 *
 * The client never touches the Anthropic API directly. All keys stay on the server.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ok, fail } from "../response.js";

import { demoListings } from "@easyfinderai/shared";
import { scoreListing, defaultScoringConfig } from "@easyfinderai/shared";
import type { Listing } from "@easyfinderai/shared";

const messageSchema = z.object({
  role:    z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
});

const BROKER_SYSTEM_PROMPT = `You are a veteran independent heavy equipment broker with 20+ years closing deals across construction, mining, agriculture, and demolition. You have zero brand loyalty — your only goal is the right machine, right price, right deal.

Always open by asking whether the user is buying, selling, or matching equipment to a job.

Buyers: Qualify first. Ask about project type, jobsite conditions, timeline, budget, and buy vs rent vs lease preference. Then recommend the best options with reasoning tied to use case, reliability, total cost of ownership, and resale value.

Sellers: Gather year, make, model, hours, condition, and service history. Give realistic market pricing based on comparable sales. Advise on positioning for a fast, fair transaction.

Every recommendation must account for: market and resale value, machine age and condition, brand and model reliability, and financing or deal structure options.

Ask one or two sharp questions at a time. Never guess — qualify before you recommend. Be direct, use industry language, and always steer toward the smartest deal, not the easiest one.

Keep responses concise — this is a mobile interface. 2–4 short paragraphs max.

When recommending specific listings from the inventory context, include a JSON block at the END of your response in this exact format:
LISTINGS_JSON:[{"id":"listing-id-here"}]

Only include the JSON block when actively recommending 1–3 specific listings. Never include it for general questions or when no inventory match exists.`;

async function getInventoryContext(): Promise<string> {
  try {
    const dbRows = null;
    const source: Listing[] = dbRows
      ? dbRows.map((row: any) => ({
          id:          String(row.id),
          title:       row.equipment,
          description: `${row.equipment} — Market Value: $${Number(row.market_value).toLocaleString()}`,
          state:       row.state   ?? "TX",
          price:       Number(row.price),
          hours:       Number(row.hours) || 0,
          operable:    row.operable ?? true,
          category:    row.equipment,
          source:      row.source  ?? "database",
          createdAt:   row.scraped_at
            ? new Date(row.scraped_at).toISOString()
            : new Date().toISOString(),
        }))
      : demoListings;

    const top10 = [...source]
      .filter((l) => l.operable)
      .map((l) => ({ listing: l, score: scoreListing(l, defaultScoringConfig) }))
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, 10);

    return top10
      .map(
        ({ listing, score }, i) =>
          `${i + 1}. ID:${listing.id} | ${listing.title} | ` +
          `$${listing.price.toLocaleString()} | ` +
          `${(listing.hours ?? 0).toLocaleString()} hrs | ` +
          `${listing.state} | Score:${score.total} | ` +
          `${(score as any).rationale?.[0] ?? ""}`
      )
      .join("\n");
  } catch {
    return "(inventory unavailable)";
  }
}

export default async function brokerRoutes(app: FastifyInstance) {
  app.post("/chat", async (request, reply) => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      return fail(
        request,
        reply,
        "BROKER_DISABLED",
        "AI broker is not configured. Set ANTHROPIC_API_KEY to enable it.",
        503
      );
    }

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return fail(request, reply, "BAD_REQUEST", "Invalid message format.", 400);
    }

    const inventoryContext = await getInventoryContext();

    const systemPrompt =
      BROKER_SYSTEM_PROMPT +
      `\n\nCURRENT SCORED INVENTORY (top 10 by score):\n${inventoryContext}`;

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system:     systemPrompt,
          messages:   body.data.messages,
        }),
      });
    } catch (err: any) {
      request.log.error({ err }, "Anthropic API request failed");
      return fail(request, reply, "BROKER_ERROR", "AI broker request failed.", 502);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      request.log.error({ status: response.status, text }, "Anthropic API error");
      return fail(request, reply, "BROKER_ERROR", "AI broker returned an error.", 502);
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    const content = data.content?.find((b) => b.type === "text")?.text ?? "";

    return ok(request, { content });
  });
}
