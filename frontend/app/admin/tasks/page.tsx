"use client";

import TasksApp from "@/app/complaints/page";
import { useAdminUser } from "@/components/admin/AdminUserContext";

export default function AdminTasksPage() {
  const admin = useAdminUser();

  return (
    <div className="admin-tasks-shell flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#efe8dc] md:h-[calc(100vh-8.5rem)] md:min-h-[480px] md:rounded-xl md:border md:border-[#2c2420]/70 md:bg-[#f7f3eb] md:shadow-[0_4px_24px_rgba(28,53,42,0.1)]">
      <div
        data-admin-tasks
        className="admin-tasks-frame relative mx-auto flex h-full min-h-0 w-full max-w-[480px] flex-col overflow-hidden bg-[#ECE5DD] md:max-w-none"
      >
        <TasksApp presetEmail={admin?.email ?? undefined} />
      </div>
    </div>
  );
}
