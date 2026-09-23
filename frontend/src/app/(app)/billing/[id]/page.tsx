import { InvoiceDetailView } from "@/components/billing/InvoiceDetailView";

/** Next 16: `params` is a Promise and must be awaited. */
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceDetailView invoiceId={Number(id)} />;
}
