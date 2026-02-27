import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getAuthSafe } from "@/lib/auth";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { signOutAction } from "./actions/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compass",
  description: "Competitive intelligence monitoring for biotech teams.",
};

const nav = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/targets", label: "Watch Targets" },
  { href: "/settings", label: "Settings" },
  { href: "/chat", label: "Chat" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { user, signInUrl } = await getAuthSafe();

  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>
          <header className="card" style={{ borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
            <div
              className="container"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <strong>Compass</strong>
              {nav.map((item) => (
                <a key={item.href} href={item.href} className="muted">
                  {item.label}
                </a>
              ))}
              <span style={{ marginLeft: "auto" }}>
                {user ? (
                  <>
                    <span className="muted" style={{ marginRight: "0.75rem" }}>
                      {user.email ?? user.firstName ?? user.id}
                    </span>
                    <form action={signOutAction} style={{ display: "inline" }}>
                      <button
                        type="submit"
                        aria-label="Sign out"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontSize: "0.8rem",
                          fontWeight: 500,
                          color: "var(--muted, #6b7280)",
                          cursor: "pointer",
                        }}
                      >
                        Sign out
                      </button>
                    </form>
                  </>
                ) : signInUrl ? (
                  <a href={signInUrl} className="muted">
                    Sign in
                  </a>
                ) : null}
              </span>
            </div>
          </header>
          <main className="container">{children}</main>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
