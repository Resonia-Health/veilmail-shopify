import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";
import crypto from "crypto";

/**
 * Webhook endpoint for receiving email status updates from Veil Mail
 *
 * POST /api/veil-webhook
 *
 * Headers:
 *   X-Veil-Signature: t=timestamp,v1=signature
 *
 * Body:
 *   { type: "email.delivered", data: { emailId: "...", ... } }
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const payload = await request.text();
  const signature = request.headers.get("X-Veil-Signature");

  // Get webhook secret from environment
  const webhookSecret = process.env.VEIL_WEBHOOK_SECRET;

  // Verify signature if secret is configured
  if (webhookSecret) {
    if (!verifySignature(payload, signature, webhookSecret)) {
      console.error("Invalid webhook signature");
      return json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // Parse the payload
  let data: { type: string; data: Record<string, unknown> };
  try {
    data = JSON.parse(payload);
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(`Veil Mail webhook received: ${data.type}`);

  try {
    await processEvent(data.type, data.data);
    return json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return json({ error: "Processing failed" }, { status: 500 });
  }
};

/**
 * Verify webhook signature
 */
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  // Parse signature header (format: t=timestamp,v1=signature)
  const parts: Record<string, string> = {};
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key && value) parts[key] = value;
  }

  if (!parts.t || !parts.v1) return false;

  // Check timestamp is within 5 minutes
  const timestamp = parseInt(parts.t, 10);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${parts.t}.${payload}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSig),
    Buffer.from(parts.v1)
  );
}

/**
 * Process webhook event
 */
async function processEvent(type: string, data: Record<string, unknown>): Promise<void> {
  const emailId = data.emailId as string;

  if (!emailId) {
    console.log("No emailId in webhook data");
    return;
  }

  // Map event types to status and timestamp fields
  const statusMap: Record<string, { status: string; field?: string }> = {
    "email.sent": { status: "SENT", field: "sentAt" },
    "email.delivered": { status: "DELIVERED", field: "deliveredAt" },
    "email.opened": { status: "OPENED", field: "openedAt" },
    "email.clicked": { status: "CLICKED", field: "clickedAt" },
    "email.bounced": { status: "BOUNCED" },
    "email.complained": { status: "BOUNCED" },
    "email.failed": { status: "FAILED" },
  };

  const mapping = statusMap[type];
  if (!mapping) {
    console.log(`Unhandled event type: ${type}`);
    return;
  }

  // Find the email log by veilEmailId
  const emailLog = await prisma.emailLog.findFirst({
    where: { veilEmailId: emailId },
  });

  if (!emailLog) {
    console.log(`Email log not found for ${emailId}`);
    return;
  }

  // Build update data
  const updateData: Record<string, unknown> = {
    status: mapping.status,
  };

  if (mapping.field) {
    updateData[mapping.field] = new Date();
  }

  // Add error message for failures
  if (mapping.status === "FAILED" || mapping.status === "BOUNCED") {
    const errorMessage = (data.reason || data.errorMessage || "Unknown error") as string;
    updateData.errorMessage = errorMessage;
  }

  await prisma.emailLog.update({
    where: { id: emailLog.id },
    data: updateData,
  });

  console.log(`Updated email ${emailId} status to ${mapping.status}`);
}
