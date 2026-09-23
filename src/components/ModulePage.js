export default function ModulePage({ title, phase, description, items = [] }) {
  return (
    <section className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
          Planned for Phase {phase}
        </p>
      </header>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
      {items.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
