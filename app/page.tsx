import { redirect } from "next/navigation";
import { getAuthSafe } from "@/lib/auth";

export default async function HomePage() {
  const { user, signInUrl } = await getAuthSafe();

  if (user) {
    redirect("/targets");
  }

  return (
    <div className="stack" style={{ gap: "1.5rem", maxWidth: "32rem" }}>
      <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>
        Compass
      </h1>
      <p className="muted" style={{ margin: 0 }}>
        Competitive intelligence monitoring for biotech teams.
      </p>
      {signInUrl ? (
        <a
          href={signInUrl}
          style={{
            display: "inline-block",
            padding: "0.75rem 1.25rem",
            borderRadius: 8,
            background: "#111827",
            color: "white",
            fontWeight: 600,
          }}
        >
          Sign in to get started
        </a>
      ) : null}
    </div>
  );
}
