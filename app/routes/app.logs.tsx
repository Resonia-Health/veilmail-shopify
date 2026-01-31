import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  DataTable,
  Badge,
  Pagination,
  Select,
  TextField,
  InlineStack,
  Button,
  EmptyState,
  Filters,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

const PAGE_SIZE = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const status = url.searchParams.get("status") || "";
  const type = url.searchParams.get("type") || "";
  const search = url.searchParams.get("search") || "";

  const store = await prisma.store.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!store) {
    return json({ logs: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  }

  // Build where clause
  const where: any = { storeId: store.id };

  if (status) {
    where.status = status;
  }

  if (type) {
    where.type = type;
  }

  if (search) {
    where.OR = [
      { toEmail: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
      { orderId: { contains: search } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.emailLog.count({ where }),
  ]);

  // Get stats
  const stats = await prisma.emailLog.groupBy({
    by: ["status"],
    where: { storeId: store.id },
    _count: true,
  });

  return json({
    logs,
    total,
    page,
    pageSize: PAGE_SIZE,
    stats: stats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
  });
};

export default function Logs() {
  const { logs, total, page, pageSize, stats } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [searchValue, setSearchValue] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "");

  const totalPages = Math.ceil(total / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;

  const handleFiltersChange = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (searchValue) params.set("search", searchValue);
    params.set("page", "1");
    setSearchParams(params);
  }, [statusFilter, typeFilter, searchValue, setSearchParams]);

  const handleClearFilters = useCallback(() => {
    setSearchValue("");
    setStatusFilter("");
    setTypeFilter("");
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const handlePagination = useCallback(
    (direction: "next" | "previous") => {
      const newPage = direction === "next" ? page + 1 : page - 1;
      const params = new URLSearchParams(searchParams);
      params.set("page", String(newPage));
      setSearchParams(params);
    },
    [page, searchParams, setSearchParams]
  );

  const rows = logs.map((log: any) => [
    formatDate(log.createdAt),
    log.toEmail,
    log.type.replace(/_/g, " "),
    log.subject,
    <StatusBadge key={log.id} status={log.status} />,
    log.orderId || "-",
  ]);

  const statusOptions = [
    { label: "All Statuses", value: "" },
    { label: "Sent", value: "SENT" },
    { label: "Delivered", value: "DELIVERED" },
    { label: "Opened", value: "OPENED" },
    { label: "Clicked", value: "CLICKED" },
    { label: "Bounced", value: "BOUNCED" },
    { label: "Failed", value: "FAILED" },
  ];

  const typeOptions = [
    { label: "All Types", value: "" },
    { label: "Order Confirmation", value: "ORDER_CONFIRMATION" },
    { label: "Shipping Notification", value: "SHIPPING_NOTIFICATION" },
    { label: "Order Cancelled", value: "ORDER_CANCELLED" },
    { label: "Refund Confirmation", value: "REFUND_CONFIRMATION" },
    { label: "Abandoned Cart", value: "ABANDONED_CART" },
    { label: "Review Request", value: "REVIEW_REQUEST" },
  ];

  return (
    <Page title="Email Logs" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {/* Stats Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Total Sent</Text>
                <Text as="p" variant="headingLg">
                  {((stats as any).SENT || 0) + ((stats as any).DELIVERED || 0) + ((stats as any).OPENED || 0) + ((stats as any).CLICKED || 0)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Delivered</Text>
                <Text as="p" variant="headingLg" tone="success">
                  {(stats as any).DELIVERED || 0}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Failed</Text>
                <Text as="p" variant="headingLg" tone="critical">
                  {((stats as any).FAILED || 0) + ((stats as any).BOUNCED || 0)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Filters */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="400" align="start" blockAlign="end">
              <div style={{ flex: 1 }}>
                <TextField
                  label="Search"
                  value={searchValue}
                  onChange={setSearchValue}
                  placeholder="Search by email, subject, or order ID"
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchValue("")}
                />
              </div>
              <div style={{ width: 180 }}>
                <Select
                  label="Status"
                  options={statusOptions}
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
              </div>
              <div style={{ width: 200 }}>
                <Select
                  label="Type"
                  options={typeOptions}
                  value={typeFilter}
                  onChange={setTypeFilter}
                />
              </div>
              <Button onClick={handleFiltersChange}>Apply</Button>
              <Button onClick={handleClearFilters} variant="plain">Clear</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Data Table */}
        <Card>
          {logs.length > 0 ? (
            <BlockStack gap="400">
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                headings={["Date", "Recipient", "Type", "Subject", "Status", "Order"]}
                rows={rows}
              />
              <InlineStack align="center">
                <Pagination
                  hasPrevious={hasPrevious}
                  hasNext={hasNext}
                  onPrevious={() => handlePagination("previous")}
                  onNext={() => handlePagination("next")}
                />
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} emails
              </Text>
            </BlockStack>
          ) : (
            <EmptyState
              heading="No emails found"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                {searchParams.toString()
                  ? "Try adjusting your filters to find what you're looking for."
                  : "Email logs will appear here once you start sending emails."}
              </p>
            </EmptyState>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}

function StatusBadge({ status }: { status: string }) {
  const toneMap: Record<string, "success" | "warning" | "critical" | "info" | undefined> = {
    SENT: "info",
    DELIVERED: "success",
    OPENED: "success",
    CLICKED: "success",
    BOUNCED: "warning",
    FAILED: "critical",
    PENDING: undefined,
  };

  return (
    <Badge tone={toneMap[status]}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
