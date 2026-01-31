import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, Banner, Button, Link } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({
    where: { shopifyDomain: session.shop },
    include: {
      emailTemplates: true,
      _count: {
        select: {
          emailLogs: true,
        },
      },
    },
  });

  // Get recent email stats
  const recentEmails = await prisma.emailLog.groupBy({
    by: ["status"],
    where: {
      storeId: store?.id,
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      },
    },
    _count: true,
  });

  const stats = {
    totalEmails: store?._count.emailLogs || 0,
    last7Days: recentEmails.reduce((sum, s) => sum + s._count, 0),
    sent: recentEmails.find((s) => s.status === "SENT")?._count || 0,
    delivered: recentEmails.find((s) => s.status === "DELIVERED")?._count || 0,
    failed: recentEmails.find((s) => s.status === "FAILED")?._count || 0,
  };

  return json({
    shop: session.shop,
    isConfigured: Boolean(store?.veilApiKey),
    store,
    stats,
  });
};

export default function Index() {
  const { shop, isConfigured, store, stats } = useLoaderData<typeof loader>();

  return (
    <Page title="Veil Mail">
      <BlockStack gap="500">
        {!isConfigured && (
          <Banner
            title="Connect your Veil Mail account"
            action={{ content: "Settings", url: "/app/settings" }}
            tone="warning"
          >
            <p>Enter your Veil Mail API key in settings to start sending emails.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Email Stats (Last 7 Days)
                </Text>
                <BlockStack gap="200">
                  <StatRow label="Total Sent" value={stats.sent} />
                  <StatRow label="Delivered" value={stats.delivered} />
                  <StatRow label="Failed" value={stats.failed} />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Quick Actions
                </Text>
                <BlockStack gap="200">
                  <Button url="/app/templates" fullWidth>
                    Configure Email Templates
                  </Button>
                  <Button url="/app/settings" fullWidth>
                    Settings
                  </Button>
                  <Button url="/app/logs" fullWidth variant="plain">
                    View Email Logs
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Getting Started
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Veil Mail helps you send secure transactional emails with automatic PII
                    protection. Here's how to get started:
                  </Text>
                  <ol>
                    <li>
                      <Text as="span" variant="bodyMd">
                        <strong>Connect your account</strong> - Add your Veil Mail API key in{" "}
                        <Link url="/app/settings">Settings</Link>
                      </Text>
                    </li>
                    <li>
                      <Text as="span" variant="bodyMd">
                        <strong>Configure templates</strong> - Customize your order confirmation,
                        shipping, and marketing emails
                      </Text>
                    </li>
                    <li>
                      <Text as="span" variant="bodyMd">
                        <strong>Enable features</strong> - Turn on customer sync, abandoned cart
                        recovery, and more
                      </Text>
                    </li>
                  </ol>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Features
                </Text>
                <Layout>
                  <Layout.Section variant="oneThird">
                    <FeatureCard
                      title="Order Emails"
                      description="Automatic order confirmation, shipping, and delivery emails"
                      enabled={store?.enableOrderEmails}
                    />
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <FeatureCard
                      title="Customer Sync"
                      description="Sync customers to Veil Mail audiences"
                      enabled={Boolean(store?.veilAudienceId)}
                    />
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <FeatureCard
                      title="Abandoned Cart"
                      description="Recover lost sales with automated emails"
                      enabled={store?.enableAbandonedCart}
                    />
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <Text as="span" variant="bodyMd">
        {label}
      </Text>
      <Text as="span" variant="bodyMd" fontWeight="semibold">
        {value.toLocaleString()}
      </Text>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  enabled,
}: {
  title: string;
  description: string;
  enabled?: boolean;
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text as="h3" variant="headingSm">
            {title}
          </Text>
          <Text
            as="span"
            variant="bodySm"
            tone={enabled ? "success" : "subdued"}
          >
            {enabled ? "Enabled" : "Disabled"}
          </Text>
        </div>
        <Text as="p" variant="bodySm" tone="subdued">
          {description}
        </Text>
      </BlockStack>
    </Card>
  );
}
