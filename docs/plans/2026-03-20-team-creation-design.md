# Teams: create, admin, email invites (design)

## Problem (historical)

Early versions created teams implicitly from email domain. That was removed in favor of **explicit workspaces**: users **create** a team (they are admin via `ownerUserId`) or **join** via **email invite** (admin enters address; recipient gets a link or sees **Pending invitations** on Settings when signed in with that email).

## Current behavior

1. **`users.teamPreference: "solo"`** — Set when the user **leaves** a team. Sign-in does **not** auto-assign a team.
2. **`teams.createTeam({ name })`** — Allowed only with **no** `teamId`. Inserts `teams` with `ownerUserId` = creator; patches user `teamId`.
3. **`teams.inviteTeamMemberByEmail({ email })`** — Admin only; inserts `teamEmailInvites` (normalized `emailLower`, opaque `token`, 7-day expiry, cap per team); schedules **`email.sendTeamInviteEmail`**. Resend sends HTML with `{APP_URL}/settings?teamInvite={token}`. Without `RESEND_API_KEY`, the row still exists; recipient can **Accept** from Settings pending list when logged in as that email.
4. **`teams.acceptTeamEmailInvite({ token })`** or **`{ inviteId }`** — Signed-in email must match invite; sets `teamId`, marks invite accepted (idempotent if already on that team).
5. **`teams.listPendingTeamInvitesForMyEmail`** — When not on a team, lists pending invites for the current user’s email.
6. **`teams.renameTeam`**, **`leaveTeam`**, **`revokeTeamInvite`**, **`runTeamBootstrap`** — As in LLD.

## Out of scope (later)

- Multiple teams per user
- Custom invite messages / reminder emails

## Flow

```
[Admin] inviteTeamMemberByEmail ──► email (optional Resend) ──► [Recipient] link or Settings pending ──► acceptTeamEmailInvite
```

## ASCII (Settings — Team, admin)

```
│ Invite a teammate by email                         │
│ [ colleague@company.com        ] [ Send invite ]    │
│ alice@… pending · until 3/15  [ Revoke ]          │
```
