import { TherapistProfile } from "@/components/therapists/TherapistProfile";

/** Next 16: `params` is a Promise and must be awaited. */
export default async function TherapistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TherapistProfile therapistId={Number(id)} />;
}
