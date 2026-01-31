import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import {
  getVeilClient,
  buildOrderConfirmationEmail,
  buildShippingNotificationEmail,
  buildOrderCancellationEmail,
} from "../services/veil.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload } = await authenticate.webhook(request);

  console.log(`Webhook received: ${topic} from ${shop}`);

  // Get store configuration
  const store = await prisma.store.findUnique({
    where: { shopifyDomain: shop },
    include: { emailTemplates: true },
  });

  if (!store) {
    console.log(`Store not found for ${shop}`);
    return new Response("Store not found", { status: 404 });
  }

  try {
    switch (topic) {
      case "APP_UNINSTALLED":
        await handleAppUninstalled(shop);
        break;

      case "CUSTOMERS_CREATE":
      case "CUSTOMERS_UPDATE":
        await handleCustomerSync(store, payload);
        break;

      case "ORDERS_CREATE":
        await handleOrderCreated(store, payload);
        break;

      case "ORDERS_FULFILLED":
        await handleOrderFulfilled(store, payload);
        break;

      case "ORDERS_CANCELLED":
        await handleOrderCancelled(store, payload);
        break;

      case "CHECKOUTS_CREATE":
      case "CHECKOUTS_UPDATE":
        await handleCheckout(store, payload);
        break;

      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(`Error processing webhook ${topic}:`, error);
    return new Response("Error", { status: 500 });
  }
};

/**
 * Handle app uninstallation
 */
async function handleAppUninstalled(shop: string) {
  await prisma.store.update({
    where: { shopifyDomain: shop },
    data: {
      isActive: false,
      uninstalledAt: new Date(),
      accessToken: null,
    },
  });
  console.log(`App uninstalled for ${shop}`);
}

/**
 * Sync customer to Veil Mail audience
 */
async function handleCustomerSync(store: any, payload: any) {
  if (!store.veilApiKey || !store.veilAudienceId) {
    console.log("Store not configured for customer sync");
    return;
  }

  const veil = await getVeilClient(store.veilApiKey);

  const result = await veil.addToAudience(store.veilAudienceId, {
    email: payload.email,
    firstName: payload.first_name,
    lastName: payload.last_name,
    metadata: {
      shopify_customer_id: payload.id,
      shopify_store: store.shopifyDomain,
      accepts_marketing: payload.accepts_marketing,
      created_at: payload.created_at,
      orders_count: payload.orders_count,
      total_spent: payload.total_spent,
    },
  });

  if (result.error) {
    console.error("Failed to sync customer:", result.error);
  } else {
    console.log(`Customer ${payload.email} synced to Veil Mail`);
  }
}

/**
 * Send order confirmation email
 */
async function handleOrderCreated(store: any, payload: any) {
  // Check if this order came from an abandoned cart and mark as recovered
  if (payload.checkout_id) {
    await prisma.abandonedCheckout.updateMany({
      where: {
        checkoutId: String(payload.checkout_id),
        isRecovered: false,
      },
      data: {
        isRecovered: true,
        recoveredAt: new Date(),
      },
    });
  }

  if (!store.veilApiKey || !store.enableOrderEmails) {
    return;
  }

  const veil = await getVeilClient(store.veilApiKey);

  // Get template config
  const template = store.emailTemplates.find(
    (t: any) => t.type === "ORDER_CONFIRMATION" && t.isEnabled
  );

  const fromEmail = template?.fromName || `orders@${store.shopifyDomain}`;
  const fromName = store.shopifyDomain.replace(".myshopify.com", "");

  const emailData = buildOrderConfirmationEmail(
    {
      email: payload.email,
      name: payload.customer?.first_name || payload.billing_address?.first_name || "Customer",
      orderNumber: payload.name.replace("#", ""),
      totalPrice: payload.total_price,
      currency: payload.currency,
      lineItems: payload.line_items.map((item: any) => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
      shippingAddress: payload.shipping_address
        ? {
            firstName: payload.shipping_address.first_name,
            lastName: payload.shipping_address.last_name,
            address1: payload.shipping_address.address1,
            city: payload.shipping_address.city,
            province: payload.shipping_address.province,
            zip: payload.shipping_address.zip,
            country: payload.shipping_address.country,
          }
        : undefined,
    },
    fromEmail,
    fromName,
    template?.veilTemplateId
  );

  const result = await veil.sendEmail(emailData);

  // Log the email
  await prisma.emailLog.create({
    data: {
      storeId: store.id,
      veilEmailId: result.data?.id,
      type: "ORDER_CONFIRMATION",
      toEmail: payload.email,
      subject: emailData.subject,
      status: result.error ? "FAILED" : "SENT",
      orderId: String(payload.id),
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      errorMessage: result.error?.message,
      sentAt: result.error ? null : new Date(),
    },
  });

  if (result.error) {
    console.error("Failed to send order confirmation:", result.error);
  } else {
    console.log(`Order confirmation sent for order ${payload.name}`);
  }
}

/**
 * Send shipping notification email
 */
async function handleOrderFulfilled(store: any, payload: any) {
  if (!store.veilApiKey || !store.enableOrderEmails) {
    return;
  }

  const veil = await getVeilClient(store.veilApiKey);

  const template = store.emailTemplates.find(
    (t: any) => t.type === "SHIPPING_NOTIFICATION" && t.isEnabled
  );

  const fromEmail = template?.fromName || `shipping@${store.shopifyDomain}`;
  const fromName = store.shopifyDomain.replace(".myshopify.com", "");

  // Get tracking info from the first fulfillment
  const fulfillment = payload.fulfillments?.[0];

  const emailData = buildShippingNotificationEmail(
    {
      email: payload.email,
      name: payload.customer?.first_name || "Customer",
      orderNumber: payload.name.replace("#", ""),
      trackingNumber: fulfillment?.tracking_number,
      trackingUrl: fulfillment?.tracking_url,
      carrier: fulfillment?.tracking_company,
    },
    fromEmail,
    fromName,
    template?.veilTemplateId
  );

  const result = await veil.sendEmail(emailData);

  await prisma.emailLog.create({
    data: {
      storeId: store.id,
      veilEmailId: result.data?.id,
      type: "SHIPPING_NOTIFICATION",
      toEmail: payload.email,
      subject: emailData.subject,
      status: result.error ? "FAILED" : "SENT",
      orderId: String(payload.id),
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      errorMessage: result.error?.message,
      sentAt: result.error ? null : new Date(),
    },
  });

  if (result.error) {
    console.error("Failed to send shipping notification:", result.error);
  } else {
    console.log(`Shipping notification sent for order ${payload.name}`);
  }

  // Schedule review request if enabled
  if (store.enableReviewRequests) {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + (store.reviewRequestDelay || 7));

    await prisma.reviewRequest.upsert({
      where: { orderId: String(payload.id) },
      update: {
        scheduledAt,
        deliveredAt: new Date(),
      },
      create: {
        storeId: store.id,
        orderId: String(payload.id),
        email: payload.email,
        customerName: payload.customer?.first_name || null,
        lineItems: payload.line_items.map((item: any) => ({
          title: item.title,
          productUrl: null,
        })),
        scheduledAt,
        deliveredAt: new Date(),
      },
    });

    console.log(`Review request scheduled for order ${payload.name} in ${store.reviewRequestDelay || 7} days`);
  }
}

/**
 * Handle order cancellation
 */
async function handleOrderCancelled(store: any, payload: any) {
  if (!store.veilApiKey || !store.enableOrderEmails) {
    return;
  }

  const veil = await getVeilClient(store.veilApiKey);

  const template = store.emailTemplates.find(
    (t: any) => t.type === "ORDER_CANCELLED" && t.isEnabled
  );

  const fromEmail = template?.fromName || `orders@${store.shopifyDomain}`;
  const fromName = store.shopifyDomain.replace(".myshopify.com", "");

  const emailData = buildOrderCancellationEmail(
    {
      email: payload.email,
      name: payload.customer?.first_name || payload.billing_address?.first_name || "Customer",
      orderNumber: payload.name.replace("#", ""),
      totalPrice: payload.total_price,
      currency: payload.currency,
      reason: payload.cancel_reason,
    },
    fromEmail,
    fromName,
    template?.veilTemplateId
  );

  const result = await veil.sendEmail(emailData);

  await prisma.emailLog.create({
    data: {
      storeId: store.id,
      veilEmailId: result.data?.id,
      type: "ORDER_CANCELLED",
      toEmail: payload.email,
      subject: emailData.subject,
      status: result.error ? "FAILED" : "SENT",
      orderId: String(payload.id),
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      errorMessage: result.error?.message,
      sentAt: result.error ? null : new Date(),
    },
  });

  if (result.error) {
    console.error("Failed to send cancellation email:", result.error);
  } else {
    console.log(`Cancellation email sent for order ${payload.name}`);
  }
}

/**
 * Handle checkout for abandoned cart tracking
 */
async function handleCheckout(store: any, payload: any) {
  if (!store.enableAbandonedCart || !payload.email) {
    return;
  }

  // Calculate when to send the abandoned cart email
  const scheduledAt = new Date();
  scheduledAt.setHours(scheduledAt.getHours() + store.abandonedCartDelay);

  await prisma.abandonedCheckout.upsert({
    where: { checkoutId: String(payload.id) },
    update: {
      email: payload.email,
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      cartTotal: payload.total_price,
      currency: payload.currency,
      lineItems: payload.line_items,
      abandonedAt: new Date(payload.updated_at),
      scheduledAt,
    },
    create: {
      storeId: store.id,
      checkoutId: String(payload.id),
      email: payload.email,
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      cartTotal: payload.total_price,
      currency: payload.currency,
      lineItems: payload.line_items,
      abandonedAt: new Date(payload.updated_at),
      scheduledAt,
    },
  });

  console.log(`Checkout ${payload.id} tracked for abandoned cart`);
}
