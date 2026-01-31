import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Banner,
  Button,
  Select,
  TextField,
  Checkbox,
  Divider,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { getVeilClient } from "../services/veil.server";

const EMAIL_TEMPLATE_TYPES = [
  { value: "ORDER_CONFIRMATION", label: "Order Confirmation", description: "Sent when an order is placed" },
  { value: "SHIPPING_NOTIFICATION", label: "Shipping Notification", description: "Sent when an order ships" },
  { value: "DELIVERY_CONFIRMATION", label: "Delivery Confirmation", description: "Sent when order is delivered" },
  { value: "ORDER_CANCELLED", label: "Order Cancelled", description: "Sent when an order is cancelled" },
  { value: "REFUND_CONFIRMATION", label: "Refund Confirmation", description: "Sent when a refund is processed" },
  { value: "ABANDONED_CART", label: "Abandoned Cart", description: "Sent to recover abandoned carts" },
  { value: "REVIEW_REQUEST", label: "Review Request", description: "Request product reviews after delivery" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({
    where: { shopifyDomain: session.shop },
    include: { emailTemplates: true },
  });

  // Get Veil Mail templates if configured
  let veilTemplates: Array<{ id: string; name: string }> = [];
  if (store?.veilApiKey) {
    try {
      const veil = await getVeilClient(store.veilApiKey);
      const result = await veil.getTemplates();
      if (result.data?.data) {
        veilTemplates = result.data.data;
      }
    } catch (error) {
      console.error("Failed to fetch Veil Mail templates:", error);
    }
  }

  return json({
    isConfigured: Boolean(store?.veilApiKey),
    templates: store?.emailTemplates || [],
    veilTemplates,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const store = await prisma.store.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!store) {
    return json({ success: false, error: "Store not found" }, { status: 404 });
  }

  const type = formData.get("type") as string;
  const name = formData.get("name") as string;
  const subject = formData.get("subject") as string;
  const veilTemplateId = formData.get("veilTemplateId") as string;
  const isEnabled = formData.get("isEnabled") === "true";
  const fromName = formData.get("fromName") as string;
  const replyTo = formData.get("replyTo") as string;

  try {
    await prisma.emailTemplate.upsert({
      where: {
        storeId_type: {
          storeId: store.id,
          type: type as any,
        },
      },
      update: {
        name,
        subject,
        veilTemplateId: veilTemplateId || null,
        isEnabled,
        fromName: fromName || null,
        replyTo: replyTo || null,
      },
      create: {
        storeId: store.id,
        type: type as any,
        name,
        subject,
        veilTemplateId: veilTemplateId || null,
        isEnabled,
        fromName: fromName || null,
        replyTo: replyTo || null,
      },
    });

    return json({ success: true });
  } catch (error) {
    console.error("Failed to save template:", error);
    return json({ success: false, error: "Failed to save template" }, { status: 500 });
  }
};

export default function Templates() {
  const { isConfigured, templates, veilTemplates } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [showSuccess, setShowSuccess] = useState(false);

  if (!isConfigured) {
    return (
      <Page title="Email Templates" backAction={{ url: "/app" }}>
        <Banner
          title="Connect your Veil Mail account first"
          action={{ content: "Go to Settings", url: "/app/settings" }}
          tone="warning"
        >
          <p>You need to add your Veil Mail API key before configuring templates.</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page title="Email Templates" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {showSuccess && (
          <Banner
            title="Template saved successfully"
            tone="success"
            onDismiss={() => setShowSuccess(false)}
          />
        )}

        <Text as="p" variant="bodyMd" tone="subdued">
          Configure which emails to send and customize their settings. You can use templates from
          your Veil Mail dashboard for full customization.
        </Text>

        {EMAIL_TEMPLATE_TYPES.map((templateType) => (
          <TemplateCard
            key={templateType.value}
            templateType={templateType}
            savedTemplate={templates.find((t: any) => t.type === templateType.value)}
            veilTemplates={veilTemplates}
            onSave={(data) => {
              const formData = new FormData();
              Object.entries(data).forEach(([key, value]) => {
                formData.append(key, String(value));
              });
              submit(formData, { method: "post" });
              setShowSuccess(true);
            }}
            isSubmitting={isSubmitting}
          />
        ))}
      </BlockStack>
    </Page>
  );
}

function TemplateCard({
  templateType,
  savedTemplate,
  veilTemplates,
  onSave,
  isSubmitting,
}: {
  templateType: { value: string; label: string; description: string };
  savedTemplate?: any;
  veilTemplates: Array<{ id: string; name: string }>;
  onSave: (data: Record<string, string | boolean>) => void;
  isSubmitting: boolean;
}) {
  const [isEnabled, setIsEnabled] = useState(savedTemplate?.isEnabled ?? true);
  const [subject, setSubject] = useState(savedTemplate?.subject || getDefaultSubject(templateType.value));
  const [veilTemplateId, setVeilTemplateId] = useState(savedTemplate?.veilTemplateId || "");
  const [fromName, setFromName] = useState(savedTemplate?.fromName || "");
  const [replyTo, setReplyTo] = useState(savedTemplate?.replyTo || "");
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSave = useCallback(() => {
    onSave({
      type: templateType.value,
      name: templateType.label,
      subject,
      veilTemplateId,
      isEnabled: isEnabled.toString(),
      fromName,
      replyTo,
    });
  }, [templateType, subject, veilTemplateId, isEnabled, fromName, replyTo, onSave]);

  const veilTemplateOptions = [
    { label: "Use default template", value: "" },
    ...veilTemplates.map((t) => ({ label: t.name, value: t.id })),
  ];

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <Text as="h2" variant="headingMd">
              {templateType.label}
            </Text>
            <Badge tone={isEnabled ? "success" : undefined}>
              {isEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </InlineStack>
          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            variant="plain"
          >
            {isExpanded ? "Collapse" : "Configure"}
          </Button>
        </InlineStack>

        <Text as="p" variant="bodySm" tone="subdued">
          {templateType.description}
        </Text>

        {isExpanded && (
          <>
            <Divider />
            <BlockStack gap="400">
              <Checkbox
                label="Enable this email"
                checked={isEnabled}
                onChange={setIsEnabled}
              />

              <TextField
                label="Email Subject"
                value={subject}
                onChange={setSubject}
                autoComplete="off"
                helpText="Customize the email subject line"
              />

              <Select
                label="Veil Mail Template"
                options={veilTemplateOptions}
                value={veilTemplateId}
                onChange={setVeilTemplateId}
                helpText="Select a template from your Veil Mail dashboard, or use the default"
              />

              <TextField
                label="From Name (optional)"
                value={fromName}
                onChange={setFromName}
                autoComplete="off"
                placeholder="Your Store Name"
                helpText="Override the sender name for this email type"
              />

              <TextField
                label="Reply-To Email (optional)"
                value={replyTo}
                onChange={setReplyTo}
                autoComplete="email"
                placeholder="support@yourstore.com"
                helpText="Where replies to this email should go"
              />

              <InlineStack align="end">
                <Button onClick={handleSave} variant="primary" loading={isSubmitting}>
                  Save Changes
                </Button>
              </InlineStack>
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

function getDefaultSubject(type: string): string {
  switch (type) {
    case "ORDER_CONFIRMATION":
      return "Order #{order_number} confirmed";
    case "SHIPPING_NOTIFICATION":
      return "Your order #{order_number} has shipped!";
    case "DELIVERY_CONFIRMATION":
      return "Your order #{order_number} has been delivered";
    case "ORDER_CANCELLED":
      return "Order #{order_number} has been cancelled";
    case "REFUND_CONFIRMATION":
      return "Refund processed for order #{order_number}";
    case "ABANDONED_CART":
      return "Don't forget your items!";
    case "REVIEW_REQUEST":
      return "How was your order? Leave a review";
    default:
      return "";
  }
}
