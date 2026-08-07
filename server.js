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
  `https://${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}@${EXOTEL_SUBDOMAIN}/v2/accounts/${EXOTEL_ACCOUNT_SID}/messages`;

// ---- Template names: replace with your actual approved template names ----
const TEMPLATES = {
  employerNotAnswered: "employer_call_missed",   // "team unable to take your call..." message
  registerToApply: "candidate_registration",     // registration link + WhatsApp channel link
  statusCheckStart: "candidate_status_request",  // "reply with your passport number..."
};

// Helper: send one WhatsApp template message via Exotel
async function sendWhatsAppTemplate(toNumber, templateName, params = []) {
  const body = {
    messages: [
      {
        from: WHATSAPP_FROM_NUMBER,
        to: toNumber,
        content: {
          recipient_type: "individual",
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
  };

  const res = await fetch(EXOTEL_MESSAGES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
app.get("/webhook/check-status", async (req, res) => {
  console.log("Passthru hit: check-status", req.query);
  const to = getCallerNumber(req);
  if (!to) return res.status(400).send("Missing caller number");

  await sendWhatsAppTemplate(to, TEMPLATES.statusCheckStart);
  res.status(200).send("OK");

  // NOTE: The passport-number reply and CRM lookup is a SEPARATE piece —
  // it needs an inbound-WhatsApp-message webhook (not Passthru), since that
  // reply comes from WhatsApp, not from the call flow. That's a follow-up
  // build once this part is working.
});

app.get("/", (req, res) => res.send("Exotel WhatsApp webhook is running."));

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
