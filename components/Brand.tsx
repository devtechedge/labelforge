import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 5.5h9.5M4 12h7M4 18.5h4.5" strokeLinecap="round" />
        <rect x="14.5" y="8.5" width="5.5" height="11" rx="1.2" />
        <path d="M17.2 5.2v1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Brand({
  href = "/",
  showName = true,
}: {
  href?: string;
  showName?: boolean;
}) {
  return (
    <Link className="brand" href={href} aria-label="LabelForge home">
      <BrandMark />
      {showName ? <span className="brand-name">LabelForge</span> : null}
    </Link>
  );
}
