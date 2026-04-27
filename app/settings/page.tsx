"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatSchedule, COMMON_TIMEZONES } from "@/lib/formatSchedule";
import { useConvexAuthQuerySkip } from "@/lib/convexAuthQuery";

function SettingsTeamInviteFromUrl({
  onAccepted,
  onError,
}: {
  onAccepted: () => void;
  onError: (message: string) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const acceptTeamEmailInvite = useMutation(api.teams.acceptTeamEmailInvite);

  useEffect(() => {
    const token = searchParams.get("teamInvite")?.trim();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        await acceptTeamEmailInvite({ token });
        if (!cancelled) {
          onAccepted();
          router.replace("/settings", { scroll: false });
        }
      } catch (e) {
        if (!cancelled) {
          onError(e instanceof Error ? e.message : "Could not accept invite");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, acceptTeamEmailInvite, router, onAccepted, onError]);

  return null;
}

export default function SettingsPage() {
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const skipQueries = useConvexAuthQuerySkip();
  const userSchedule = useQuery(api.userDigestSchedule.get, skipQueries ? "skip" : {});
  const decisionBriefPreference = useQuery(
    api.users.getDecisionBriefPreference,
    skipQueries ? "skip" : {},
  );
  const membership = useQuery(api.teams.getMyMembership, skipQueries ? "skip" : {});
  const teamMembers = useQuery(api.teams.listTeamMembers, skipQueries ? "skip" : {});
  const setUserSchedule = useMutation(api.userDigestSchedule.set);
  const setDecisionBriefPreference = useMutation(api.users.setDecisionBriefPreference);
  const removeUserSchedule = useMutation(api.userDigestSchedule.remove);
  const createTeam = useMutation(api.teams.createTeam);
  const leaveTeam = useMutation(api.teams.leaveTeam);
  const inviteTeamMemberByEmail = useMutation(api.teams.inviteTeamMemberByEmail);
  const acceptTeamEmailInvite = useMutation(api.teams.acceptTeamEmailInvite);
  const revokeTeamInvite = useMutation(api.teams.revokeTeamInvite);
  const renameTeamMutation = useMutation(api.teams.renameTeam);

  const teamInvites = useQuery(
    api.teams.listMyTeamInvites,
    skipQueries ||
      membership === undefined ||
      membership === null ||
      !membership.team ||
      !membership.isTeamAdmin
      ? "skip"
      : {},
  );
  const pendingInvitesForMe = useQuery(
    api.teams.listPendingTeamInvitesForMyEmail,
    skipQueries ||
      membership === undefined ||
      membership === null ||
      membership.team != null
      ? "skip"
      : {},
  );

  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [saving, setSaving] = useState(false);
  const [decisionPrefSaving, setDecisionPrefSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionPrefError, setDecisionPrefError] = useState<string | null>(null);
  const [decisionPrefMessage, setDecisionPrefMessage] = useState<string | null>(null);
  const [decisionPrefDraft, setDecisionPrefDraft] = useState<"inherit" | "enabled" | "disabled">(
    "inherit",
  );
  const [newTeamName, setNewTeamName] = useState("");
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [inviteEmailInput, setInviteEmailInput] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"team" | "digest">("team");

  const onInviteLinkAccepted = useCallback(() => {
    setTeamMessage("You joined the team from your invite link.");
    setTeamError(null);
    setActiveTab("team");
  }, []);
  const onInviteLinkError = useCallback((message: string) => {
    setTeamError(message);
    setActiveTab("team");
  }, []);

  useEffect(() => {
    const n = membership?.team?.name;
    if (typeof n === "string") setRenameDraft(n);
  }, [membership?.team?.name]);

  useEffect(() => {
    if (decisionBriefPreference === undefined) return;
    setDecisionPrefDraft(decisionBriefPreference.preference);
  }, [decisionBriefPreference]);

  if (convexAuthLoading) {
    return (
      <main className="stack" aria-label="Settings">
        <h1>Settings</h1>
        <p className="muted" role="status" aria-live="polite">
          Connecting to your workspace…
        </p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="stack" aria-label="Settings">
        <h1>Settings</h1>
        <section className="card stack" style={{ gap: "0.5rem" }}>
          <p style={{ margin: 0 }}>Convex couldn’t verify your session.</p>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Refresh after signing in. Check <code className="muted">NEXT_PUBLIC_CONVEX_URL</code> and Convex JWT auth if this
            continues.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="stack" aria-label="Settings">
      <Suspense fallback={null}>
        <SettingsTeamInviteFromUrl onAccepted={onInviteLinkAccepted} onError={onInviteLinkError} />
      </Suspense>
      <h1>Settings</h1>
      <p className="muted">Team workspace, digest timing, and related preferences.</p>

      <div className="settings-layout">
        <nav className="settings-sidebar" aria-label="Settings categories">
          <div className="settings-tablist" role="tablist" aria-orientation="vertical">
            <button
              type="button"
              role="tab"
              id="settings-tab-team"
              className="settings-tab"
              aria-selected={activeTab === "team"}
              aria-controls="settings-panel-team"
              tabIndex={activeTab === "team" ? 0 : -1}
              onClick={() => setActiveTab("team")}
            >
              Team
            </button>
            <button
              type="button"
              role="tab"
              id="settings-tab-digest"
              className="settings-tab"
              aria-selected={activeTab === "digest"}
              aria-controls="settings-panel-digest"
              tabIndex={activeTab === "digest" ? 0 : -1}
              onClick={() => setActiveTab("digest")}
            >
              Digest schedule
            </button>
          </div>
        </nav>

        <div className="settings-panels stack" style={{ gap: "1rem" }}>
          <div
            id="settings-panel-team"
            role="tabpanel"
            aria-labelledby="settings-tab-team"
            hidden={activeTab !== "team"}
          >
      <section className="card stack" aria-labelledby="team-heading">
        <h2 id="team-heading" style={{ margin: 0, fontSize: "1.1rem" }}>
          Team
        </h2>
        {membership === undefined ? (
          <p className="muted" style={{ margin: 0 }} role="status" aria-live="polite">
            Loading team…
          </p>
        ) : membership === null ? (
          <p className="muted" style={{ margin: 0 }} role="alert">
            Could not load team settings.
          </p>
        ) : membership.team ? (
          <div className="stack" style={{ gap: "0.75rem" }}>
            <div>
              {membership.isTeamAdmin ? (
                <form
                  className="stack"
                  style={{ gap: "0.4rem", maxWidth: 420 }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const next = renameDraft.trim();
                    if (!next) {
                      setTeamError("Team name cannot be empty.");
                      return;
                    }
                    if (next === membership.team?.name.trim()) {
                      return;
                    }
                    setTeamError(null);
                    setTeamMessage(null);
                    setTeamBusy(true);
                    try {
                      await renameTeamMutation({ name: next });
                      setTeamMessage("Team name updated.");
                    } catch (err) {
                      setTeamError(err instanceof Error ? err.message : "Could not rename team");
                    } finally {
                      setTeamBusy(false);
                    }
                  }}
                >
                  <label htmlFor="team-rename-input" style={{ display: "block" }}>
                    <span className="muted" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                      Team name
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                      <input
                        id="team-rename-input"
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        className="card"
                        style={{ flex: "1 1 200px", minWidth: 0, padding: "0.5rem", fontWeight: 600 }}
                        aria-label="Team name"
                        autoComplete="organization"
                      />
                      <button
                        type="submit"
                        disabled={
                          teamBusy ||
                          !renameDraft.trim() ||
                          renameDraft.trim() === (membership.team?.name ?? "").trim()
                        }
                        aria-busy={teamBusy}
                        className="card"
                        style={{
                          padding: "0.45rem 0.85rem",
                          fontWeight: 600,
                          fontSize: "0.9rem",
                          borderRadius: 8,
                          border: "none",
                          cursor:
                            teamBusy ||
                            !renameDraft.trim() ||
                            renameDraft.trim() === (membership.team?.name ?? "").trim()
                              ? "not-allowed"
                              : "pointer",
                          background: "var(--ink, #111827)",
                          color: "white",
                          opacity:
                            teamBusy ||
                            !renameDraft.trim() ||
                            renameDraft.trim() === (membership.team?.name ?? "").trim()
                              ? 0.5
                              : 1,
                        }}
                      >
                        Save name
                      </button>
                    </div>
                  </label>
                </form>
              ) : (
                <p style={{ margin: 0, fontWeight: 600 }}>{membership.team.name}</p>
              )}
              <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                {membership.isTeamAdmin ? "You are the team admin. " : null}
                {teamMembers === undefined
                  ? "Loading members…"
                  : `${teamMembers.length} member${teamMembers.length === 1 ? "" : "s"}`}
                . Share watch targets here; teammates subscribe on Watch Targets.
              </p>
            </div>
            {teamMembers !== undefined && teamMembers.length > 0 && (
              <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
                {teamMembers.map((m) => (
                  <li key={m._id}>
                    {m.email}
                    {membership.team?.ownerUserId === m._id ? (
                      <span className="muted" style={{ marginLeft: "0.35rem", fontSize: "0.8rem" }}>
                        (admin)
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {membership.isTeamAdmin && (
              <div className="stack" style={{ gap: "0.5rem" }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Invite a teammate by email. They’ll get a link to accept (expires in 7 days). They must sign in with that same
                  email address.
                </p>
                <form
                  className="stack"
                  style={{ gap: "0.4rem", maxWidth: 420 }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const em = inviteEmailInput.trim();
                    if (!em) {
                      setTeamError("Enter an email address.");
                      return;
                    }
                    setTeamError(null);
                    setTeamMessage(null);
                    setTeamBusy(true);
                    try {
                      await inviteTeamMemberByEmail({ email: em });
                      setInviteEmailInput("");
                      setTeamMessage(`Invite sent to ${em}. They can also accept from Settings if they’re already signed in.`);
                    } catch (err) {
                      setTeamError(err instanceof Error ? err.message : "Could not send invite");
                    } finally {
                      setTeamBusy(false);
                    }
                  }}
                >
                  <label htmlFor="team-invite-email" style={{ display: "block" }}>
                    <span className="muted" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                      Teammate email
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                      <input
                        id="team-invite-email"
                        type="email"
                        value={inviteEmailInput}
                        onChange={(e) => setInviteEmailInput(e.target.value)}
                        placeholder="colleague@company.com"
                        className="card"
                        style={{ flex: "1 1 200px", minWidth: 0, padding: "0.5rem" }}
                        autoComplete="email"
                        aria-label="Teammate email for team invite"
                      />
                      <button
                        type="submit"
                        disabled={teamBusy}
                        aria-busy={teamBusy}
                        className="card"
                        style={{
                          padding: "0.45rem 0.85rem",
                          fontWeight: 600,
                          fontSize: "0.9rem",
                          borderRadius: 8,
                          border: "none",
                          cursor: teamBusy ? "not-allowed" : "pointer",
                          background: "var(--ink, #111827)",
                          color: "white",
                        }}
                      >
                        Send invite
                      </button>
                    </div>
                  </label>
                </form>
                {teamInvites !== undefined && teamInvites.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
                    {teamInvites.map((inv) => (
                      <li key={inv._id} style={{ marginBottom: "0.35rem" }}>
                        <span style={{ fontWeight: 500 }}>{inv.email}</span>
                        <span className="muted" style={{ marginLeft: "0.5rem" }}>
                          pending · until {new Date(inv.expiresAt).toLocaleDateString()}
                        </span>
                        <button
                          type="button"
                          className="card muted"
                          aria-label={`Revoke invite for ${inv.email}`}
                          style={{
                            marginLeft: "0.35rem",
                            padding: "0.2rem 0.45rem",
                            fontSize: "0.8rem",
                            borderRadius: 6,
                            border: "1px solid var(--border, #e5e7eb)",
                            cursor: "pointer",
                            background: "var(--surface, #fff)",
                          }}
                          onClick={async () => {
                            setTeamError(null);
                            setTeamBusy(true);
                            try {
                              await revokeTeamInvite({ inviteId: inv._id });
                              setTeamMessage("Invite revoked.");
                            } catch (err) {
                              setTeamError(err instanceof Error ? err.message : "Could not revoke");
                            } finally {
                              setTeamBusy(false);
                            }
                          }}
                        >
                          Revoke
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button
              type="button"
              disabled={teamBusy}
              aria-busy={teamBusy}
              className="card"
              style={{
                alignSelf: "flex-start",
                padding: "0.4rem 0.75rem",
                fontWeight: 600,
                fontSize: "0.9rem",
                border: "1px solid var(--error, #b91c1c)",
                color: "var(--error, #b91c1c)",
                background: "transparent",
                borderRadius: 8,
                cursor: teamBusy ? "not-allowed" : "pointer",
              }}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Leave this team? You will stop seeing teammates’ watch targets until you create or join another team. Subscriptions to others’ targets will be removed.",
                  )
                ) {
                  return;
                }
                setTeamError(null);
                setTeamMessage(null);
                setTeamBusy(true);
                try {
                  await leaveTeam();
                  setTeamMessage("You left the team. Create a new team or accept an email invite below.");
                } catch (e) {
                  setTeamError(e instanceof Error ? e.message : "Could not leave team");
                } finally {
                  setTeamBusy(false);
                }
              }}
            >
              Leave team
            </button>
          </div>
        ) : (
          <div className="stack" style={{ gap: "0.75rem" }}>
            <p id="team-no-team-hint" className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              {membership.teamPreference === "solo"
                ? "You’re not on a team. If a teammate invited you by email, use the link in that message (or accept a pending invite below). You can also create your own workspace."
                : "You’re not on a team yet. Accept an email invite or create a workspace."}
            </p>
            {pendingInvitesForMe !== undefined && pendingInvitesForMe.length > 0 && (
              <div className="stack" style={{ gap: "0.35rem" }} role="region" aria-label="Pending team invitations">
                <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>Pending invitations</p>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
                  {pendingInvitesForMe.map((p) => (
                    <li key={p.inviteId} style={{ marginBottom: "0.5rem" }}>
                      <span>
                        <strong>{p.teamName}</strong>
                        <span className="muted" style={{ marginLeft: "0.35rem" }}>
                          · expires {new Date(p.expiresAt).toLocaleDateString()}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="card"
                        disabled={teamBusy}
                        aria-busy={teamBusy}
                        aria-label={`Accept invitation to ${p.teamName}`}
                        style={{
                          display: "block",
                          marginTop: "0.25rem",
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          borderRadius: 8,
                          border: "none",
                          cursor: teamBusy ? "not-allowed" : "pointer",
                          background: "var(--ink, #111827)",
                          color: "white",
                        }}
                        onClick={async () => {
                          setTeamError(null);
                          setTeamMessage(null);
                          setTeamBusy(true);
                          try {
                            await acceptTeamEmailInvite({ inviteId: p.inviteId });
                            setTeamMessage(`You joined ${p.teamName}.`);
                          } catch (err) {
                            setTeamError(err instanceof Error ? err.message : "Could not join team");
                          } finally {
                            setTeamBusy(false);
                          }
                        }}
                      >
                        Accept
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Or start a new team:
            </p>
            <form
              className="stack"
              style={{ gap: "0.5rem" }}
              onSubmit={async (e) => {
                e.preventDefault();
                const name = newTeamName.trim();
                if (!name) {
                  setTeamError("Enter a team name.");
                  return;
                }
                setTeamError(null);
                setTeamMessage(null);
                setTeamBusy(true);
                try {
                  await createTeam({ name });
                  setNewTeamName("");
                  setTeamMessage("Team created. You’re admin — invite teammates by email from this tab.");
                } catch (err) {
                  setTeamError(err instanceof Error ? err.message : "Could not create team");
                } finally {
                  setTeamBusy(false);
                }
              }}
            >
              <label style={{ display: "block" }}>
                <span className="muted" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                  New team name
                </span>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Acme CI"
                  className="card"
                  style={{ width: "100%", maxWidth: 360, padding: "0.5rem" }}
                  aria-label="New team name"
                />
              </label>
              <button
                type="submit"
                disabled={teamBusy}
                aria-busy={teamBusy}
                className="card"
                style={{
                  alignSelf: "flex-start",
                  padding: "0.5rem 1rem",
                  cursor: teamBusy ? "not-allowed" : "pointer",
                  background: "var(--ink, #111827)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                Create team
              </button>
            </form>
          </div>
        )}
        {teamMessage && (
          <p style={{ margin: 0, color: "var(--success, #059669)", fontSize: "0.9rem" }} role="status" aria-live="polite">
            {teamMessage}
          </p>
        )}
        {teamError && (
          <p style={{ margin: 0, color: "var(--error, #b91c1c)", fontSize: "0.9rem" }} role="alert">
            {teamError}
          </p>
        )}
      </section>
          </div>

          <div
            id="settings-panel-digest"
            role="tabpanel"
            aria-labelledby="settings-tab-digest"
            hidden={activeTab !== "digest"}
          >
      <section className="card stack" aria-labelledby="digest-schedule-heading">
        <h2 id="digest-schedule-heading" style={{ margin: 0, fontSize: "1.1rem" }}>
          Digest schedule
        </h2>
        <p id="digest-schedule-help" className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          This is the <strong>only</strong> automatic scan schedule: one combined daily or weekly run of your subscribed watch
          targets (team) or owned active targets (solo), plus one digest email. Manual “Run scan” on each target is unchanged.
        </p>
        <label style={{ display: "block" }}>
          <span className="muted" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
            Decision brief in digest emails
          </span>
          <select
            value={decisionPrefDraft}
            disabled={decisionBriefPreference === undefined || decisionPrefSaving}
            onChange={(e) => {
              setDecisionPrefError(null);
              setDecisionPrefMessage(null);
              setDecisionPrefDraft(e.target.value as "inherit" | "enabled" | "disabled");
            }}
            className="card"
            style={{ padding: "0.5rem", maxWidth: 360 }}
            aria-label="Decision brief preference for digest emails"
          >
            <option value="inherit">
              Use workspace default
              {decisionBriefPreference
                ? ` (currently ${decisionBriefPreference.systemDefaultEnabled ? "on" : "off"})`
                : ""}
            </option>
            <option value="enabled">Always include decision brief</option>
            <option value="disabled">Never include decision brief</option>
          </select>
        </label>
        <button
          type="button"
          disabled={
            decisionBriefPreference === undefined ||
            decisionPrefSaving ||
            decisionPrefDraft === decisionBriefPreference.preference
          }
          aria-busy={decisionPrefSaving}
          className="card"
          style={{
            alignSelf: "flex-start",
            padding: "0.45rem 0.85rem",
            fontWeight: 600,
            fontSize: "0.9rem",
            borderRadius: 8,
            border: "none",
            cursor:
              decisionBriefPreference === undefined ||
              decisionPrefSaving ||
              decisionPrefDraft === decisionBriefPreference.preference
                ? "not-allowed"
                : "pointer",
            background: "var(--ink, #111827)",
            color: "white",
            opacity:
              decisionBriefPreference === undefined ||
              decisionPrefSaving ||
              decisionPrefDraft === decisionBriefPreference.preference
                ? 0.5
                : 1,
          }}
          onClick={async () => {
            setDecisionPrefError(null);
            setDecisionPrefMessage(null);
            setDecisionPrefSaving(true);
            try {
              await setDecisionBriefPreference({ preference: decisionPrefDraft });
              setDecisionPrefMessage("Decision brief preference saved.");
            } catch (err) {
              setDecisionPrefError(
                err instanceof Error ? err.message : "Could not update decision brief preference",
              );
            } finally {
              setDecisionPrefSaving(false);
            }
          }}
        >
          {decisionPrefSaving ? "Saving preference…" : "Save preference"}
        </button>
        <p id="decision-brief-pref-help" className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Controls whether your digest emails include the Decision brief section when decision fields exist on that run.
          {decisionBriefPreference
            ? ` Effective: ${decisionBriefPreference.effectiveEnabled ? "included" : "hidden"}.`
            : ""}
        </p>
        {decisionPrefMessage && (
          <p style={{ margin: 0, color: "var(--success, #059669)", fontSize: "0.9rem" }} role="status" aria-live="polite">
            {decisionPrefMessage}
          </p>
        )}
        {decisionPrefError && (
          <p style={{ margin: 0, color: "var(--error, #b91c1c)", fontSize: "0.9rem" }} role="alert">
            {decisionPrefError}
          </p>
        )}
        {userSchedule === undefined ? (
          <p className="muted" style={{ margin: 0 }}>Loading…</p>
        ) : userSchedule === null ? (
          <p className="muted" style={{ margin: 0 }}>No global schedule set.</p>
        ) : (
          <p style={{ margin: 0 }}>
            <strong>Current:</strong> {formatSchedule(userSchedule)}
            <button
              type="button"
              onClick={() => removeUserSchedule()}
              className="card muted"
              style={{ marginLeft: "0.5rem", padding: "0.25rem 0.5rem", fontSize: "0.9rem" }}
            >
              Remove
            </button>
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const text = description.trim();
            if (!text) {
              setError("Enter a schedule in plain language (e.g. “Every day at 7am”).");
              return;
            }
            setError(null);
            setSaving(true);
            try {
              const res = await fetch("/api/schedule/parse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description: text, timezone }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Failed to parse schedule");
              await setUserSchedule({
                timezone: data.timezone ?? timezone,
                dailyEnabled: data.dailyEnabled ?? false,
                dailyHour: data.dailyHour ?? 9,
                dailyMinute: data.dailyMinute ?? 0,
                weeklyEnabled: data.weeklyEnabled ?? false,
                weeklyDayOfWeek: data.weeklyDayOfWeek ?? 1,
                weeklyHour: data.weeklyHour ?? 9,
                weeklyMinute: data.weeklyMinute ?? 0,
                weekdaysOnly: data.weekdaysOnly,
                rawDescription: data.rawDescription ?? text,
              });
              setDescription("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setSaving(false);
            }
          }}
          className="stack"
          style={{ gap: "0.75rem", marginTop: "0.5rem" }}
        >
          <label style={{ display: "block" }}>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
              Schedule (e.g. “Every day at 7am”, “Weekdays at 8:30”)
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Every day at 7am"
              className="card"
              style={{ width: "100%", maxWidth: 420, padding: "0.5rem" }}
              aria-label="Natural language digest schedule"
              aria-describedby="digest-schedule-help"
            />
          </label>
          <label style={{ display: "block" }}>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
              Timezone
            </span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="card"
              style={{ padding: "0.5rem", maxWidth: 320 }}
              aria-label="Timezone for digest schedule"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="card"
            style={{
              alignSelf: "flex-start",
              padding: "0.5rem 1rem",
              cursor: saving ? "not-allowed" : "pointer",
              background: "var(--ink, #111827)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving schedule…" : "Save schedule"}
          </button>
        </form>
        {error && (
          <p style={{ margin: 0, color: "var(--error, #b91c1c)", fontSize: "0.9rem" }} role="alert">
            {error}
          </p>
        )}
      </section>
          </div>
        </div>
      </div>
    </main>
  );
}
