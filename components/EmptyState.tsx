import { CliprMark } from "@/components/CliprLogo";

type EmptyStateProps = {
  title: string;
  hint?: string;
  children?: React.ReactNode;
};

export default function EmptyState({ title, hint, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-clipr-card neo-inset px-6 py-14 text-center">
      <div className="flex size-16 items-center justify-center rounded-full neo-raised">
        <CliprMark size={32} muted />
      </div>
      <p className="text-lg font-semibold text-clipr-text">{title}</p>
      {hint && (
        <p className="max-w-sm text-sm text-clipr-secondary">{hint}</p>
      )}
      {children}
    </div>
  );
}
