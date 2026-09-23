import SidebarNav from "@/components/SidebarNav";

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen w-full">
      <aside className="w-60 shrink-0 border-r border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-6 px-3">
          <p className="text-sm font-semibold">WhatsApp Agent</p>
          <p className="text-xs text-zinc-500">Automation SaaS</p>
        </div>
        <SidebarNav />
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
