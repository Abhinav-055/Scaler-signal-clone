import type { LucideIcon } from "lucide-react";

/** Placeholder for tabs Signal Desktop has but this clone doesn't implement (Calls, Stories). */
export function ComingSoon({ title, icon: Icon, text }: { title: string; icon: LucideIcon; text: string }) {
  return (
    <div className="flex min-w-0 flex-1">
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-border bg-panel md:flex lg:w-[320px]">
        <h1 className="px-4 pt-4 pb-2 text-[20px] font-semibold">{title}</h1>
        <p className="px-4 text-[13px] text-secondary">Nothing here yet.</p>
      </aside>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 bg-bg p-8 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={36} />
        </span>
        <h2 className="text-[22px] font-semibold">{title} are coming soon</h2>
        <p className="max-w-sm text-secondary">{text}</p>
      </section>
    </div>
  );
}
