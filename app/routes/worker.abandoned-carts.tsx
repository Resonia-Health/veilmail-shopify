import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";
import {
  getVeilClient,
  buildAbandonedCartEmail,
} from "../services/veil.server";

/**
 * Worker endpoint to process abandoned cart emails
 * Should be called by a cron job every 5-15 minutes
 *
 * GET /worker/abandoned-carts?secret=YOUR_WORKER_SECRET
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Verify worker secret to prevent unauthorized access
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
    // Find all due abandoned checkouts that haven't been sent yet
    const dueCheckouts = await prisma.abandonedCheckout.findMany({
      where: {
        emailSent: false,
        isRecovered: false,
        scheduledAt: {
          lte: now,
        },
      },
      take: 50, // Process in batches
    });

    console.log(`Processing ${dueCheckouts.length} abandoned checkouts`);

    for (const checkout of dueCheckouts) {
      try {
        // Get the store config
        const store = await prisma.store.findFirst({
          where: { id: checkout.storeId },
          include: { emailTemplates: true },
        });

        if (!store || !store.veilApiKey || !store.enableAbandonedCart) {
          // Mark as sent to prevent retrying
          await prisma.abandonedCheckout.update({
            where: { id: checkout.id },
            data: { emailSent: true },
          });
          continue;
        }

        const veil = await getVeilClient(store.veilApiKey);

        // Get template config
        const template = store.emailTemplates.find(
          (t) => t.type === "ABANDONED_CART" && t.isEnabled
        );

        const storeName = store.shopifyDomain.replace(".myshopify.com", "");
        const fromEmail = template?.fromName || `cart@${store.shopifyDomain}`;

        // Build recovery URL - Shopify provides this in the checkout data
        const recoveryUrl = `https://${store.shopifyDomain}/checkouts/${checkout.checkoutId}/recover`;

        // Parse line items from JSON
        const lineItems = (checkout.lineItems as Array<{
          title: string;
          quantity: number;
          price: string;
        }>) || [];

        const emailData = buildAbandonedCartEmail(
          {
            email: checkout.email,
            cartTotal: String(checkout.cartTotal),
            currency: checkout.currency,
            lineItems,
            recoveryUrl,
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
            type: "ABANDONED_CART",
            toEmail: checkout.email,
            subject: emailData.subject,
            status: result.error ? "FAILED" : "SENT",
            checkoutId: checkout.checkoutId,
            customerId: checkout.customerId,
            errorMessage: result.error?.message,
            sentAt: result.error ? null : new Date(),
          },
        });

        // Update the checkout record
        await prisma.abandonedCheckout.update({
          where: { id: checkout.id },
          data: {
            emailSent: true,
            emailSentAt: result.error ? null : new Date(),
          },
        });

        if (result.error) {
          console.error(`Failed to send abandoned cart email for ${checkout.checkoutId}:`, result.error);
          failed++;
        } else {
          console.log(`Abandoned cart email sent to ${checkout.email}`);
          processed++;
        }
      } catch (error) {
        console.error(`Error processing checkout ${checkout.checkoutId}:`, error);
        failed++;
      }
    }

    // Cleanup old abandoned checkouts (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await prisma.abandonedCheckout.deleteMany({
      where: {
        abandonedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    return json({
      success: true,
      processed,
      failed,
      total: dueCheckouts.length,
    });
  } catch (error) {
    console.error("Worker error:", error);
    return json(
      { error: "Worker failed", details: String(error) },
      { status: 500 }
    );
  }
};
