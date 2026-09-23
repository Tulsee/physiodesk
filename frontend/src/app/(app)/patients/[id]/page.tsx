import { PatientProfile } from "@/components/patients/PatientProfile";

/**
 * In Next 16 `params` is a Promise and must be awaited — synchronous access was
 * removed. The id is handed to a client component, which owns the tab state and
 * the per-tab fetching.
 */
export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PatientProfile patientId={Number(id)} />;
}
