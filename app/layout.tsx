import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compass",
  description: "Competitive intelligence monitoring for biotech teams.",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/setup", label: "Setup" },
  { href: "/history", label: "History" },
  { href: "/targets", label: "Watch Targets" },
  { href: "/settings", label: "Settings" },
  { href: "/chat", label: "Chat" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>
          <header className="card" style={{ borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
            <div className="container" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <strong>Compass</strong>
              {nav.map((item) => (
                <a key={item.href} href={item.href} className="muted">
                  {item.label}
                </a>
              ))}
            </div>
          </header>
          <main className="container">{children}</main>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
