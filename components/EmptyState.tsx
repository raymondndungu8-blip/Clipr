import { CliprMark } from "@/components/CliprLogo";

type EmptyStateProps = {
  title: string;
  hint?: string;
  children?: React.ReactNode;
};

export default function EmptyState({ title, hint, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-clipr-border bg-clipr-card/40 px-6 py-14 text-center">
      <CliprMark size={36} muted />
      <p className="text-lg text-clipr-text">{title}</p>
      {hint && (
        <p className="max-w-sm text-sm text-clipr-secondary">{hint}</p>
      )}
      {children}
    </div>
  );
}
