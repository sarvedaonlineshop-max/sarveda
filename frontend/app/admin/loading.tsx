import { AdminSkeleton } from "@/components/admin/AdminSkeleton";

export default function AdminRouteLoading() {
  return (
    <div className="admin-native-route-skeleton" role="status" aria-label="Loading admin page">
      <span className="sr-only">Loading admin page…</span>
      <div className="flex items-start justify-between gap-6">
        <div>
          <AdminSkeleton width="11rem" height={20} />
          <div className="mt-2.5"><AdminSkeleton width="24rem" height={10} /></div>
        </div>
        <AdminSkeleton width="7rem" height={34} style={{ borderRadius: 8 }} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="admin-surface rounded-[10px] border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-4">
            <AdminSkeleton width="48%" height={9} />
            <div className="mt-3"><AdminSkeleton width="34%" height={24} /></div>
            <div className="mt-3"><AdminSkeleton width="68%" height={8} /></div>
          </div>
        ))}
      </div>
      <div className="admin-surface mt-4 overflow-hidden rounded-[10px] border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)]">
        <div className="flex items-center justify-between border-b border-[var(--admin-card-border)] p-4">
          <AdminSkeleton width="9rem" height={11} />
          <AdminSkeleton width="6rem" height={30} style={{ borderRadius: 8 }} />
        </div>
        <div className="px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid min-h-[52px] grid-cols-[minmax(160px,1fr)_160px_120px] items-center gap-6 border-b border-[var(--admin-card-border)] last:border-0">
              <AdminSkeleton width={`${32 + (i % 3) * 9}%`} height={9} />
              <AdminSkeleton width="65%" height={9} />
              <AdminSkeleton width="52%" height={9} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
