import Link from "next/link";

export function Forbidden({
  title = "You do not have access to this view",
  body = "Your workspace role does not include this action. Ask the workspace owner if you need access.",
  backHref,
  backLabel = "Back to workspace",
}: {
  title?: string;
  body?: string;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <main id="main-content" className="page container-narrow">
      <div className="empty-state">
        <p className="eyebrow">Permission denied</p>
        <h1 className="display-sm">{title}</h1>
        <p className="lede small">{body}</p>
        <Link className="btn btn-secondary" href={backHref}>
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
