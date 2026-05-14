import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/discovery", label: "Discovery" },
  { href: "/candidates", label: "Candidates" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/videos", label: "Videos" },
  { href: "/compare", label: "Compare" },
  { href: "/report", label: "Report" },
  { href: "/settings", label: "Settings" }
];

export const metadata: Metadata = {
  title: "YouTube Market Intelligence",
  description: "YouTube-only market intelligence for combat-sport performance content."
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-border bg-panel">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  YouTube-only MVP
                </p>
                <h1 className="text-2xl font-semibold tracking-normal">
                  Market Intelligence
                </h1>
              </div>
              <nav className="flex flex-wrap gap-2 text-sm">
                {navItems.map((item) => (
                  <Link
                    className="rounded-md border border-border bg-background px-3 py-2 hover:border-accent"
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
