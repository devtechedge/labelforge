"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ProjectTab = {
  href: string;
  label: string;
  exact?: boolean;
};

export function ProjectTabs({ tabs }: { tabs: ProjectTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="project-tabs" aria-label="Project sections">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
