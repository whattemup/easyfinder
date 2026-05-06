import { FastifyInstance } from "fastify";
import { evaluateDeal } from "../lib/dealEngine.js";
import { getListingsCollection } from "../listings.js";
import { Resend } from "resend";
import { env } from "../env.js";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function draftNegotiationEmail(deal: any, round: number, category: string) {
  const counter = deal.negotiation[round - 1];
  const prompt = `You are a professional equipment buyer. Draft a professional counter-offer email.

Deal: ${category}
Asking: $${deal.asking_price.toLocaleString()}
Fair Value: $${deal.fair_value.toLocaleString()}
Wear Penalty: $${deal.costs.wear_penalty.toLocaleString()}
Total Acquisition Cost: $${deal.costs.total_acquisition.toLocaleString()}
Current ROI: ${(deal.roi_at_ask * 100).toFixed(1)}%
Counter Price: $${counter?.counter_price.toLocaleString()}
Counter ROI: ${(counter?.achieved_roi * 100).toFixed(1)}%

Write a professional, concise counter-offer email (under 150 words). Include wear/hours analysis. No preamble.`;

  const fallbackEmail = `Subject: Counter-Offer: ${category}

Dear Seller,

Based on market analysis and wear assessment ($${deal.costs.wear_penalty.toLocaleString()} estimated), we propose $${counter?.counter_price.toLocaleString()} for your ${category}.

Best regards`;

  if (!ANTHROPIC_KEY) return { email: fallbackEmail, fallback: true };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`API ${response.status}`);
    return { email: data?.content?.[0]?.text || "Failed to generate email", fallback: false };
  } catch (e: any) {
    console.error("Email generation error:", e.message);
    return { email: fallbackEmail, fallback: true };
  }
}

async function sendViaResend(to: string, subject: string, body: string): Promise<{ sent: boolean; reason: string }> {
  if (!resend || !env.RESEND_FROM) return { sent: false, reason: "Resend not configured" };
  try {
    await resend.emails.send({
      from: env.RESEND_FROM,
      to,
      subject,
      html: `<pre style="font-family:sans-serif;white-space:pre-wrap;">${body}</pre>`,
    });
    return { sent: true, reason: "" };
  } catch (e: any) {
    console.error("Resend error:", e.message);
    return { sent: false, reason: e.message };
  }
}

export default async function emailRoutes(app: FastifyInstance) {
  app.post("/draft-negotiation", { preHandler: app.authenticate }, async (request, reply) => {
    try {
      const input = request.body as any;
      const { listing_id, asking_price, category, market_p50, hours, condition, round = 1, send_to } = input;

      let deal: any;

      if (listing_id && !asking_price) {
        const listing = await getListingsCollection().findById(listing_id);
        if (!listing) return reply.status(404).send({ error: "Listing not found" });
        deal = evaluateDeal({
          listing_id,
          asking_price:   listing.price ?? 0,
          category:       listing.category ?? "equipment",
          market_p50:     (listing as any).marketValue ?? null,
          hours:          listing.hours ?? null,
          condition:      (listing.operable !== false) ? "good" : "fair",
          operable:       listing.operable !== false,
          distance_miles: 150,
        });
      } else if (asking_price && category && market_p50) {
        deal = evaluateDeal({
          listing_id:     listing_id || "direct",
          asking_price,
          category,
          market_p50,
          hours:          hours ?? null,
          condition:      condition ?? "unknown",
          operable:       true,
          distance_miles: 120,
        });
      } else {
        return reply.status(400).send({
          error: "Provide listing_id OR (asking_price, category, market_p50)",
        });
      }

      if (deal.decision !== "NEGOTIATE") {
        return reply.send({
          decision: deal.decision,
          message:  deal.decision === "BUY" ? "Strong buy — accept at asking" : "Walk from deal",
          email:    null,
        });
      }

      const roundNum = Math.min(Math.max(Number(round), 1), deal.negotiation.length || 1);
      const emailResult = await draftNegotiationEmail(deal, roundNum, category);

      let sendResult: { sent: boolean; reason: string } = { sent: false, reason: "No recipient provided" };
      if (send_to) {
        const subject = `Counter-Offer Round ${roundNum}: ${category}`;
        sendResult = await sendViaResend(send_to, subject, emailResult.email);
      }

      return reply.send({
        decision:          deal.decision,
        round:             roundNum,
        counter_price:     deal.negotiation[roundNum - 1]?.counter_price,
        roi:               deal.negotiation[roundNum - 1]?.achieved_roi,
        wear_penalty:      deal.costs.wear_penalty,
        total_acquisition: deal.costs.total_acquisition,
        email:             emailResult.email,
        fallback:          emailResult.fallback,
        sent:              sendResult.sent,
        send_reason:       sendResult.reason ?? null,
      });
    } catch (e: any) {
      app.log.error(e, "email/draft error");
      return reply.status(500).send({ error: "Email generation failed", detail: e.message });
    }
  });
}
