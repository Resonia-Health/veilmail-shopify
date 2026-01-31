import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";
import {
  getVeilClient,
  buildReviewRequestEmail,
} from "../services/veil.server";

/**
 * Worker endpoint to process review request emails
 * Should be called by a cron job daily
 *
 * GET /worker/review-requests?secret=YOUR_WORKER_SECRET
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Verify worker secret
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const workerSecret = process.env.WORKER_SECRET;

  if (!workerSecret || secret !== workerSecret) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let processed = 0;
  let failed = 0;

  try {
    // Find all due review requests that haven't been sent yet
    const dueRequests = await prisma.reviewRequest.findMany({
      where: {
        emailSent: false,
        scheduledAt: {
          lte: now,
        },
      },
      take: 50, // Process in batches
    });

    console.log(`Processing ${dueRequests.length} review requests`);

    for (const reviewRequest of dueRequests) {
      try {
        // Get the store config
        const store = await prisma.store.findFirst({
          where: { id: reviewRequest.storeId },
          include: { emailTemplates: true },
        });

        if (!store || !store.veilApiKey || !store.enableReviewRequests) {
          // Mark as sent to prevent retrying
          await prisma.reviewRequest.update({
            where: { id: reviewRequest.id },
            data: { emailSent: true },
          });
          continue;
        }

        const veil = await getVeilClient(store.veilApiKey);

        // Get template config
        const template = store.emailTemplates.find(
          (t) => t.type === "REVIEW_REQUEST" && t.isEnabled
        );

        const storeName = store.shopifyDomain.replace(".myshopify.com", "");
        const fromEmail = template?.fromName || `reviews@${store.shopifyDomain}`;

        // Build review URL - typically points to store's review page
        const reviewUrl = `https://${store.shopifyDomain}/account/orders`;

        // Parse line items from JSON
        const lineItems = (reviewRequest.lineItems as Array<{
          title: string;
          productUrl?: string;
        }>) || [];

        const emailData = buildReviewRequestEmail(
          {
            email: reviewRequest.email,
            name: reviewRequest.customerName || "Customer",
            orderNumber: reviewRequest.orderId,
            lineItems,
            reviewUrl,
            storeName,
          },
          fromEmail,
          storeName,
          template?.veilTemplateId || undefined
        );

        const result = await veil.sendEmail(emailData);

        // Log the email
        await prisma.emailLog.create({
          data: {
            storeId: store.id,
            veilEmailId: result.data?.id,
            type: "REVIEW_REQUEST",
            toEmail: reviewRequest.email,
            subject: emailData.subject,
            status: result.error ? "FAILED" : "SENT",
            orderId: reviewRequest.orderId,
            errorMessage: result.error?.message,
            sentAt: result.error ? null : new Date(),
          },
        });

        // Update the review request record
        await prisma.reviewRequest.update({
          where: { id: reviewRequest.id },
          data: {
            emailSent: true,
            emailSentAt: result.error ? null : new Date(),
          },
        });

        if (result.error) {
          console.error(`Failed to send review request for order ${reviewRequest.orderId}:`, result.error);
          failed++;
        } else {
          console.log(`Review request sent to ${reviewRequest.email}`);
          processed++;
        }
      } catch (error) {
        console.error(`Error processing review request ${reviewRequest.id}:`, error);
        failed++;
      }
    }

    // Cleanup old review requests (older than 60 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    await prisma.reviewRequest.deleteMany({
      where: {
        deliveredAt: {
          lt: sixtyDaysAgo,
        },
      },
    });

    return json({
      success: true,
      processed,
      failed,
      total: dueRequests.length,
    });
  } catch (error) {
    console.error("Worker error:", error);
    return json(
      { error: "Worker failed", details: String(error) },
      { status: 500 }
    );
  }
};
