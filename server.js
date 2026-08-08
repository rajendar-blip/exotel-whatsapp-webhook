// Exotel Passthru → WhatsApp webhook
// Receives GET requests from Exotel's Passthru applet during a call flow,
// then calls Exotel's WhatsApp Business API to send the right message.

const express = require("express");
const app = express();

// ---- Config: fill these in on your hosting platform's Environment tab ----
const {
  EXOTEL_API_KEY,
  EXOTEL_API_TOKEN,
  EXOTEL_ACCOUNT_SID,
  EXOTEL_SUBDOMAIN,        // "api.in.exotel.com" (Mumbai) or "api.exotel.com" (Singapore)
  WHATSAPP_FROM_NUMBER,    // your approved Exotel WhatsApp business number, e.g. +919876500001
  PORT = 3000,
} = process.env;

const EXOTEL_MESSAGES_URL =
  `https://${EXOTEL_SUBDOMAIN}/v2/accounts/${EXOTEL_ACCOUNT_SID}/messages`;

const BASIC_AUTH = Buffer.from(`${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`).toString("base64");

// ---- Template names: only these two are approved and in use right now ----
const TEMPLATES = {
  employerNotAnswered: "ifnotanswered",   // "team unable to take your call..." message
  registerToApply: "registertoapply",     // registration link + WhatsApp channel link
  // statusCheckStart: not approved yet — route disabled below until it's ready
};

// Helper: send one WhatsApp template message via Exotel
async function sendWhatsAppTemplate(toNumber, templateName, params = []) {
  const body = {
    whatsapp: {
      messages: [
        {
          from: WHATSAPP_FROM_NUMBER,
          to: toNumber,
          content: {
            type: "template",
            template: {
              name: templateName,
              language: { code: "en", policy: "deterministic" },
              components: params.length
                ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
                : [],
            },
          },
        },
      ],
    },
  };

  const res = await fetch(EXOTEL_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${BASIC_AUTH}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  console.log(`WhatsApp send to ${toNumber} (${templateName}):`, res.status, JSON.stringify(data));
  return { status: res.status, data };
}

// Exotel Passthru sends caller details as URL query params (GET request).
// The caller's number usually arrives as "From". Log the full query once
// to confirm the exact param names your flow is sending — Exotel's payload
// can vary slightly by applet position.
function getCallerNumber(req) {
  return req.query.From || req.query.CallFrom || req.query.CallerId;
}

// ---- Route 1: Employer branch, call not answered ----
app.get("/webhook/employer-not-answered", async (req, res) => {
  console.log("Passthru hit: employer-not-answered", req.query);
  const to = getCallerNumber(req);
  if (!to) return res.status(400).send("Missing caller number");

  await sendWhatsAppTemplate(to, TEMPLATES.employerNotAnswered);
  res.status(200).send("OK"); // 200 tells Exotel this step succeeded
});

// ---- Route 2: Candidate branch, Option 1 — Register to Apply ----
app.get("/webhook/register-to-apply", async (req, res) => {
  console.log("Passthru hit: register-to-apply", req.query);
  const to = getCallerNumber(req);
  if (!to) return res.status(400).send("Missing caller number");

  await sendWhatsAppTemplate(to, TEMPLATES.registerToApply);
  res.status(200).send("OK");
});

// ---- Route 3: Candidate branch, Option 2 — Check Application Status ----
// DISABLED: template not approved / not in use yet. Do not point a Passthru
// applet at this URL until it's re-enabled — it will currently return 503.
app.get("/webhook/check-status", async (req, res) => {
  console.log("Passthru hit: check-status (disabled)", req.query);
  res.status(503).send("Status-check template not enabled yet");
});

app.get("/", (req, res) => res.send("Exotel WhatsApp webhook is running."));

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
