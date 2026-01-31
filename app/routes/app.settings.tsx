import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  BlockStack,
  Text,
  Banner,
  Checkbox,
  Select,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { getVeilClient } from "../services/veil.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({
    where: { shopifyDomain: session.shop },
  });

  // If API key is configured, fetch audiences
  let audiences: Array<{ id: string; name: string }> = [];
  if (store?.veilApiKey) {
    const veil = await getVeilClient(store.veilApiKey);
    const result = await veil.getAudiences();
    if (result.data?.data) {
      audiences = result.data.data;
    }
  }

  return json({
    store,
    audiences,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const veilApiKey = formData.get("veilApiKey") as string;
  const veilAudienceId = formData.get("veilAudienceId") as string;
  const enableOrderEmails = formData.get("enableOrderEmails") === "true";
  const enableAbandonedCart = formData.get("enableAbandonedCart") === "true";
  const abandonedCartDelay = parseInt(formData.get("abandonedCartDelay") as string) || 24;
  const enableReviewRequests = formData.get("enableReviewRequests") === "true";
  const reviewRequestDelay = parseInt(formData.get("reviewRequestDelay") as string) || 7;

  // Validate API key if provided
  if (veilApiKey) {
    const veil = await getVeilClient(veilApiKey);
    const isValid = await veil.validateApiKey();
    if (!isValid) {
      return json({ error: "Invalid API key" }, { status: 400 });
    }
  }

  await prisma.store.update({
    where: { shopifyDomain: session.shop },
    data: {
      veilApiKey: veilApiKey || null,
      veilAudienceId: veilAudienceId || null,
      enableOrderEmails,
      enableAbandonedCart,
      abandonedCartDelay,
      enableReviewRequests,
      reviewRequestDelay,
    },
  });

  return json({ success: true });
};

export default function Settings() {
  const { store, audiences } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [apiKey, setApiKey] = useState(store?.veilApiKey || "");
  const [audienceId, setAudienceId] = useState(store?.veilAudienceId || "");
  const [enableOrderEmails, setEnableOrderEmails] = useState(store?.enableOrderEmails ?? true);
  const [enableAbandonedCart, setEnableAbandonedCart] = useState(
    store?.enableAbandonedCart ?? false
  );
  const [abandonedCartDelay, setAbandonedCartDelay] = useState(
    String(store?.abandonedCartDelay ?? 24)
  );
  const [enableReviewRequests, setEnableReviewRequests] = useState(
    store?.enableReviewRequests ?? false
  );
  const [reviewRequestDelay, setReviewRequestDelay] = useState(
    String(store?.reviewRequestDelay ?? 7)
  );

  const audienceOptions = [
    { label: "Select an audience", value: "" },
    ...audiences.map((a) => ({ label: a.name, value: a.id })),
  ];

  return (
    <Page
      title="Settings"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Form method="post">
        <BlockStack gap="500">
          {actionData?.error && (
            <Banner tone="critical">
              <p>{actionData.error}</p>
            </Banner>
          )}

          {actionData?.success && (
            <Banner tone="success">
              <p>Settings saved successfully!</p>
            </Banner>
          )}

          <Layout>
            <Layout.AnnotatedSection
              title="Veil Mail Connection"
              description="Connect your Veil Mail account to send emails."
            >
              <Card>
                <FormLayout>
                  <TextField
                    label="API Key"
                    type="password"
                    name="veilApiKey"
                    value={apiKey}
                    onChange={setApiKey}
                    autoComplete="off"
                    helpText={
                      <>
                        Get your API key from{" "}
                        <a
                          href="https://app.veilmail.xyz/dashboard/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Veil Mail Dashboard
                        </a>
                      </>
                    }
                  />

                  {audiences.length > 0 && (
                    <Select
                      label="Default Audience"
                      name="veilAudienceId"
                      options={audienceOptions}
                      value={audienceId}
                      onChange={setAudienceId}
                      helpText="New customers will be synced to this audience"
                    />
                  )}
                </FormLayout>
              </Card>
            </Layout.AnnotatedSection>

            <Layout.AnnotatedSection
              title="Order Emails"
              description="Configure automatic transactional emails for orders."
            >
              <Card>
                <FormLayout>
                  <input
                    type="hidden"
                    name="enableOrderEmails"
                    value={String(enableOrderEmails)}
                  />
                  <Checkbox
                    label="Enable order emails"
                    checked={enableOrderEmails}
                    onChange={setEnableOrderEmails}
                    helpText="Send order confirmation, shipping, and delivery emails through Veil Mail"
                  />
                </FormLayout>
              </Card>
            </Layout.AnnotatedSection>

            <Layout.AnnotatedSection
              title="Abandoned Cart Recovery"
              description="Recover lost sales by sending emails to customers who left items in their cart."
            >
              <Card>
                <FormLayout>
                  <input
                    type="hidden"
                    name="enableAbandonedCart"
                    value={String(enableAbandonedCart)}
                  />
                  <Checkbox
                    label="Enable abandoned cart emails"
                    checked={enableAbandonedCart}
                    onChange={setEnableAbandonedCart}
                  />

                  {enableAbandonedCart && (
                    <Select
                      label="Send email after"
                      name="abandonedCartDelay"
                      options={[
                        { label: "1 hour", value: "1" },
                        { label: "3 hours", value: "3" },
                        { label: "6 hours", value: "6" },
                        { label: "12 hours", value: "12" },
                        { label: "24 hours", value: "24" },
                        { label: "48 hours", value: "48" },
                      ]}
                      value={abandonedCartDelay}
                      onChange={setAbandonedCartDelay}
                      helpText="How long to wait before sending an abandoned cart email"
                    />
                  )}
                </FormLayout>
              </Card>
            </Layout.AnnotatedSection>

            <Layout.AnnotatedSection
              title="Review Requests"
              description="Request product reviews from customers after their orders are delivered."
            >
              <Card>
                <FormLayout>
                  <input
                    type="hidden"
                    name="enableReviewRequests"
                    value={String(enableReviewRequests)}
                  />
                  <Checkbox
                    label="Enable review request emails"
                    checked={enableReviewRequests}
                    onChange={setEnableReviewRequests}
                    helpText="Automatically send review requests after order delivery"
                  />

                  {enableReviewRequests && (
                    <Select
                      label="Send email after delivery"
                      name="reviewRequestDelay"
                      options={[
                        { label: "3 days", value: "3" },
                        { label: "5 days", value: "5" },
                        { label: "7 days", value: "7" },
                        { label: "10 days", value: "10" },
                        { label: "14 days", value: "14" },
                        { label: "21 days", value: "21" },
                      ]}
                      value={reviewRequestDelay}
                      onChange={setReviewRequestDelay}
                      helpText="How many days after delivery to request a review"
                    />
                  )}
                </FormLayout>
              </Card>
            </Layout.AnnotatedSection>
          </Layout>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primary" submit loading={isSubmitting}>
              Save Settings
            </Button>
          </div>
        </BlockStack>
      </Form>
    </Page>
  );
}
