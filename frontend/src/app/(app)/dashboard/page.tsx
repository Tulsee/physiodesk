import { PageHeader } from "@/components/ui/Primitives";
import { EmptyState } from "@/components/ui/States";

/** Placeholder: the real dashboard arrives in Phase 7. */
export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today at a glance."
      />
      <div className="rounded-xl border border-[var(--border)] bg-white">
        <EmptyState
          title="Dashboard coming next"
          message="Summary cards, the capacity strip and recent patients are built in the next phase."
        />
      </div>
    </>
  );
}
