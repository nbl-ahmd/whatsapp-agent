import BackendStatus from "@/components/BackendStatus";
import { modules } from "@/config/modules";

export default function DashboardPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Next.js frontend only - all data and WhatsApp operations run through the
          standalone backend API.
        </p>
      </header>

      <div className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Backend
        </h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <BackendStatus />
        </ul>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Core modules
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {modules.map((module) => (
            <li
              key={module.name}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <p className="font-mono text-sm">{module.name}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Phase {module.phase} - {module.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
