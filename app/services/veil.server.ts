/**
 * Veil Mail API Client for Shopify App
 */

interface VeilEmailData {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

interface VeilSubscriberData {
  email: string;
  firstName?: string;
  lastName?: string;
  metadata?: Record<string, unknown>;
}

interface VeilApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export class VeilMailClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiKey: string, apiUrl: string = "https://api.veilmail.xyz") {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  private async request<T>(
    endpoint: string,
    method: string = "GET",
    data?: unknown
  ): Promise<VeilApiResponse<T>> {
    const url = `${this.apiUrl}/${endpoint.replace(/^\//, "")}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "VeilMail-Shopify/1.0.0",
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        error: result.error || {
          code: "unknown_error",
          message: "An unknown error occurred",
        },
      };
    }

    return { data: result };
  }

  /**
   * Send an email
   */
  async sendEmail(emailData: VeilEmailData): Promise<VeilApiResponse<{ id: string }>> {
    return this.request("v1/emails", "POST", emailData);
  }

  /**
   * Get email status
   */
  async getEmail(emailId: string): Promise<VeilApiResponse<{ id: string; status: string }>> {
    return this.request(`v1/emails/${emailId}`);
  }

  /**
   * Create or update a subscriber
   */
  async upsertSubscriber(data: VeilSubscriberData): Promise<VeilApiResponse<{ id: string }>> {
    return this.request("v1/subscribers", "POST", data);
  }

  /**
   * Add subscriber to audience
   */
  async addToAudience(
    audienceId: string,
    data: VeilSubscriberData
  ): Promise<VeilApiResponse<{ id: string }>> {
    return this.request(`v1/audiences/${audienceId}/subscribers`, "POST", data);
  }

  /**
   * Get audiences
   */
  async getAudiences(): Promise<VeilApiResponse<{ data: Array<{ id: string; name: string }> }>> {
    return this.request("v1/audiences");
  }

  /**
   * Get templates
   */
  async getTemplates(): Promise<
    VeilApiResponse<{ data: Array<{ id: string; name: string; subject: string }> }>
  > {
    return this.request("v1/templates");
  }

  /**
   * Validate API key
   */
  async validateApiKey(): Promise<boolean> {
    const result = await this.request("v1/me");
    return !result.error;
  }
}

/**
 * Get Veil Mail client for a store
 */
export async function getVeilClient(apiKey: string): Promise<VeilMailClient> {
  return new VeilMailClient(apiKey);
}

/**
 * Build email data for review request
 */
export function buildReviewRequestEmail(
  order: {
    email: string;
    name: string;
    orderNumber: string;
    lineItems: Array<{ title: string; productUrl?: string }>;
    reviewUrl: string;
    storeName: string;
  },
  fromEmail: string,
  fromName: string,
  templateId?: string
): VeilEmailData {
  const templateData = {
    customer_name: order.name,
    order_number: order.orderNumber,
    products: order.lineItems,
    review_url: order.reviewUrl,
    store_name: order.storeName,
  };

  if (templateId) {
    return {
      from: fromEmail,
      fromName,
      to: [order.email],
      subject: `How was your order from ${order.storeName}?`,
      templateId,
      templateData,
    };
  }

  const productsHtml = order.lineItems
    .slice(0, 3)
    .map(
      (item) => `
        <li style="margin-bottom: 8px;">${item.title}</li>
      `
    )
    .join("");

  return {
    from: fromEmail,
    fromName,
    to: [order.email],
    subject: `How was your order from ${order.storeName}?`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="background: #8b5cf6; padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">How Was Your Order?</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hi ${order.name},
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              We hope you're enjoying your recent purchase from <strong>${order.storeName}</strong>!
              We'd love to hear what you think.
            </p>
            <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 12px; color: #666; font-size: 14px; font-weight: 600;">Your order included:</p>
              <ul style="margin: 0; padding-left: 20px; color: #666;">
                ${productsHtml}
              </ul>
            </div>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Your feedback helps other customers and helps us improve. It only takes a minute!
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${order.reviewUrl}" style="display: inline-block; background: #8b5cf6; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">Leave a Review</a>
            </div>
          </div>
          <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              Powered by <a href="https://veilmail.xyz" style="color: #6366f1;">Veil Mail</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
How Was Your Order?

Hi ${order.name},

We hope you're enjoying your recent purchase from ${order.storeName}! We'd love to hear what you think.

Your order included:
${order.lineItems.map((item) => `- ${item.title}`).join("\n")}

Your feedback helps other customers and helps us improve. It only takes a minute!

Leave a review: ${order.reviewUrl}

Thank you for shopping with us!
    `.trim(),
  };
}

/**
 * Build email data for order confirmation
 */
export function buildOrderConfirmationEmail(
  order: {
    email: string;
    name: string;
    orderNumber: string;
    totalPrice: string;
    currency: string;
    lineItems: Array<{ title: string; quantity: number; price: string }>;
    shippingAddress?: {
      firstName: string;
      lastName: string;
      address1: string;
      city: string;
      province: string;
      zip: string;
      country: string;
    };
  },
  fromEmail: string,
  fromName: string,
  templateId?: string
): VeilEmailData {
  const templateData = {
    order_number: order.orderNumber,
    customer_name: order.name,
    total_price: order.totalPrice,
    currency: order.currency,
    line_items: order.lineItems,
    shipping_address: order.shippingAddress,
  };

  if (templateId) {
    return {
      from: fromEmail,
      fromName,
      to: [order.email],
      subject: `Order #${order.orderNumber} Confirmed`,
      templateId,
      templateData,
    };
  }

  // Fallback HTML template
  const lineItemsHtml = order.lineItems
    .map(
      (item) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${item.title}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${item.price}</td>
        </tr>
      `
    )
    .join("");

  return {
    from: fromEmail,
    fromName,
    to: [order.email],
    subject: `Order #${order.orderNumber} Confirmed`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="background: #6366f1; padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Order Confirmed!</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hi ${order.name},
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Thank you for your order! We're processing it now and will notify you when it ships.
            </p>
            <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; color: #666; font-size: 14px;">Order Number</p>
              <p style="margin: 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">#${order.orderNumber}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 12px; text-align: left; font-weight: 600;">Item</th>
                  <th style="padding: 12px; text-align: center; font-weight: 600;">Qty</th>
                  <th style="padding: 12px; text-align: right; font-weight: 600;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${lineItemsHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="padding: 12px; text-align: right; font-weight: 600;">Total:</td>
                  <td style="padding: 12px; text-align: right; font-weight: 600; font-size: 18px;">${order.currency} ${order.totalPrice}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              Powered by <a href="https://veilmail.xyz" style="color: #6366f1;">Veil Mail</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Order Confirmed!

Hi ${order.name},

Thank you for your order! We're processing it now and will notify you when it ships.

Order Number: #${order.orderNumber}

Items:
${order.lineItems.map((item) => `- ${item.title} x${item.quantity} - ${item.price}`).join("\n")}

Total: ${order.currency} ${order.totalPrice}

Thank you for shopping with us!
    `.trim(),
  };
}

/**
 * Build email data for abandoned cart recovery
 */
export function buildAbandonedCartEmail(
  checkout: {
    email: string;
    customerName?: string;
    cartTotal: string;
    currency: string;
    lineItems: Array<{ title: string; quantity: number; price: string; image?: string }>;
    recoveryUrl: string;
    storeName: string;
  },
  fromEmail: string,
  fromName: string,
  templateId?: string
): VeilEmailData {
  const templateData = {
    customer_name: checkout.customerName || "there",
    cart_total: checkout.cartTotal,
    currency: checkout.currency,
    line_items: checkout.lineItems,
    recovery_url: checkout.recoveryUrl,
    store_name: checkout.storeName,
  };

  if (templateId) {
    return {
      from: fromEmail,
      fromName,
      to: [checkout.email],
      subject: `Don't forget your items at ${checkout.storeName}!`,
      templateId,
      templateData,
    };
  }

  const lineItemsHtml = checkout.lineItems
    .slice(0, 5)
    .map(
      (item) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            ${item.title}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${item.price}</td>
        </tr>
      `
    )
    .join("");

  const moreItemsNote =
    checkout.lineItems.length > 5
      ? `<p style="color: #666; font-size: 14px; text-align: center;">+ ${checkout.lineItems.length - 5} more item(s)</p>`
      : "";

  return {
    from: fromEmail,
    fromName,
    to: [checkout.email],
    subject: `Don't forget your items at ${checkout.storeName}!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="background: #f59e0b; padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">You Left Something Behind!</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hi ${checkout.customerName || "there"},
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              We noticed you left some great items in your cart at <strong>${checkout.storeName}</strong>.
              Don't worry, we saved them for you!
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 12px; text-align: left; font-weight: 600;">Item</th>
                  <th style="padding: 12px; text-align: center; font-weight: 600;">Qty</th>
                  <th style="padding: 12px; text-align: right; font-weight: 600;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${lineItemsHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="padding: 12px; text-align: right; font-weight: 600;">Cart Total:</td>
                  <td style="padding: 12px; text-align: right; font-weight: 600; font-size: 18px;">${checkout.currency} ${checkout.cartTotal}</td>
                </tr>
              </tfoot>
            </table>
            ${moreItemsNote}
            <div style="text-align: center; margin: 32px 0;">
              <a href="${checkout.recoveryUrl}" style="display: inline-block; background: #f59e0b; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">Complete Your Purchase</a>
            </div>
            <p style="color: #999; font-size: 14px; text-align: center;">
              This link will take you back to your cart with all your items ready to go.
            </p>
          </div>
          <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              Powered by <a href="https://veilmail.xyz" style="color: #6366f1;">Veil Mail</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
You Left Something Behind!

Hi ${checkout.customerName || "there"},

We noticed you left some great items in your cart at ${checkout.storeName}. Don't worry, we saved them for you!

Your Cart:
${checkout.lineItems.map((item) => `- ${item.title} x${item.quantity} - ${item.price}`).join("\n")}

Cart Total: ${checkout.currency} ${checkout.cartTotal}

Complete your purchase: ${checkout.recoveryUrl}

This link will take you back to your cart with all your items ready to go.

Thanks for shopping with us!
    `.trim(),
  };
}

/**
 * Build email data for order cancellation
 */
export function buildOrderCancellationEmail(
  order: {
    email: string;
    name: string;
    orderNumber: string;
    totalPrice: string;
    currency: string;
    reason?: string;
  },
  fromEmail: string,
  fromName: string,
  templateId?: string
): VeilEmailData {
  if (templateId) {
    return {
      from: fromEmail,
      fromName,
      to: [order.email],
      subject: `Order #${order.orderNumber} has been cancelled`,
      templateId,
      templateData: {
        order_number: order.orderNumber,
        customer_name: order.name,
        total_price: order.totalPrice,
        currency: order.currency,
        cancellation_reason: order.reason,
      },
    };
  }

  return {
    from: fromEmail,
    fromName,
    to: [order.email],
    subject: `Order #${order.orderNumber} has been cancelled`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="background: #ef4444; padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Order Cancelled</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hi ${order.name},
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Your order <strong>#${order.orderNumber}</strong> has been cancelled.
            </p>
            ${order.reason ? `<p style="color: #666; font-size: 16px; line-height: 1.6;">Reason: ${order.reason}</p>` : ""}
            <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; color: #666; font-size: 14px;">Order Total</p>
              <p style="margin: 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">${order.currency} ${order.totalPrice}</p>
            </div>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              If you were charged, a refund will be processed to your original payment method within 5-10 business days.
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              If you have any questions, please don't hesitate to contact us.
            </p>
          </div>
          <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              Powered by <a href="https://veilmail.xyz" style="color: #6366f1;">Veil Mail</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Order Cancelled

Hi ${order.name},

Your order #${order.orderNumber} has been cancelled.
${order.reason ? `Reason: ${order.reason}` : ""}

Order Total: ${order.currency} ${order.totalPrice}

If you were charged, a refund will be processed to your original payment method within 5-10 business days.

If you have any questions, please don't hesitate to contact us.
    `.trim(),
  };
}

/**
 * Build email data for refund confirmation
 */
export function buildRefundConfirmationEmail(
  refund: {
    email: string;
    name: string;
    orderNumber: string;
    refundAmount: string;
    currency: string;
    reason?: string;
  },
  fromEmail: string,
  fromName: string,
  templateId?: string
): VeilEmailData {
  if (templateId) {
    return {
      from: fromEmail,
      fromName,
      to: [refund.email],
      subject: `Refund processed for order #${refund.orderNumber}`,
      templateId,
      templateData: {
        order_number: refund.orderNumber,
        customer_name: refund.name,
        refund_amount: refund.refundAmount,
        currency: refund.currency,
        refund_reason: refund.reason,
      },
    };
  }

  return {
    from: fromEmail,
    fromName,
    to: [refund.email],
    subject: `Refund processed for order #${refund.orderNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="background: #3b82f6; padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Refund Processed</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hi ${refund.name},
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              We've processed a refund for your order <strong>#${refund.orderNumber}</strong>.
            </p>
            <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; color: #666; font-size: 14px;">Refund Amount</p>
              <p style="margin: 0; color: #10b981; font-size: 24px; font-weight: 600;">${refund.currency} ${refund.refundAmount}</p>
            </div>
            ${refund.reason ? `<p style="color: #666; font-size: 16px; line-height: 1.6;">Reason: ${refund.reason}</p>` : ""}
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              The refund will appear on your original payment method within 5-10 business days.
            </p>
          </div>
          <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              Powered by <a href="https://veilmail.xyz" style="color: #6366f1;">Veil Mail</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Refund Processed

Hi ${refund.name},

We've processed a refund for your order #${refund.orderNumber}.

Refund Amount: ${refund.currency} ${refund.refundAmount}
${refund.reason ? `Reason: ${refund.reason}` : ""}

The refund will appear on your original payment method within 5-10 business days.

Thank you for your patience.
    `.trim(),
  };
}

/**
 * Build email data for shipping notification
 */
export function buildShippingNotificationEmail(
  order: {
    email: string;
    name: string;
    orderNumber: string;
    trackingNumber?: string;
    trackingUrl?: string;
    carrier?: string;
  },
  fromEmail: string,
  fromName: string,
  templateId?: string
): VeilEmailData {
  if (templateId) {
    return {
      from: fromEmail,
      fromName,
      to: [order.email],
      subject: `Your order #${order.orderNumber} has shipped!`,
      templateId,
      templateData: {
        order_number: order.orderNumber,
        customer_name: order.name,
        tracking_number: order.trackingNumber,
        tracking_url: order.trackingUrl,
        carrier: order.carrier,
      },
    };
  }

  const trackingHtml = order.trackingUrl
    ? `<a href="${order.trackingUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Track Your Package</a>`
    : order.trackingNumber
      ? `<p style="color: #666;">Tracking Number: <strong>${order.trackingNumber}</strong></p>`
      : "";

  return {
    from: fromEmail,
    fromName,
    to: [order.email],
    subject: `Your order #${order.orderNumber} has shipped!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="background: #10b981; padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Your Order Has Shipped! 📦</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hi ${order.name},
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Great news! Your order #${order.orderNumber} is on its way to you.
            </p>
            ${order.carrier ? `<p style="color: #666;">Carrier: <strong>${order.carrier}</strong></p>` : ""}
            <div style="text-align: center; margin: 32px 0;">
              ${trackingHtml}
            </div>
          </div>
          <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              Powered by <a href="https://veilmail.xyz" style="color: #6366f1;">Veil Mail</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Your Order Has Shipped!

Hi ${order.name},

Great news! Your order #${order.orderNumber} is on its way to you.

${order.carrier ? `Carrier: ${order.carrier}` : ""}
${order.trackingNumber ? `Tracking Number: ${order.trackingNumber}` : ""}
${order.trackingUrl ? `Track your package: ${order.trackingUrl}` : ""}

Thank you for shopping with us!
    `.trim(),
  };
}
