import Link from "next/link";

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <p className="eyebrow">Nothing here yet</p>
      <h2>{title}</h2>
      <p className="lede small">{body}</p>
      {actionHref && actionLabel ? (
        <Link className="btn btn-primary" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
      {children}
    </div>
  );
}
