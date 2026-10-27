import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4.5 4.5h2.2v15H4.5z" fill="currentColor" />
        <path
          d="M10.5 5.5h9M10.5 12h9M10.5 18.5h5.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
        />
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
