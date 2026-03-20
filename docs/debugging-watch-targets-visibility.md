# Debugging: “My watch targets disappeared”

## What usually happened

Data was not deleted. **`watchTargets.listAll`** used to load targets in one of two **exclusive** ways:

- If your user had a **`teamId`**: load only rows where `watchTargets.teamId === users.teamId`.
- If you had **no team**: load only rows where `watchTargets.userId === you`.

After team model changes (no domain auto-team, leaving/creating/joining teams, email invites), it’s common for **your user’s `teamId` to no longer match the `teamId` stored on documents you created**. Examples:

1. You **created a new team** or **joined a different team** → `users.teamId` is a new id, but older targets still have the **previous** team’s id (or `undefined`).
2. You were **solo**, created targets with no `teamId`, then **joined a team** → the old code only queried `by_teamId`, so targets without that team id vanished from the list.

Detail pages could still work for **owned** targets because **`userOwnsTarget`** returns true when `target.userId === you`, even if `teamId` is stale — so the bug looked like “empty list but maybe bookmarks still work.”

## Fix (code)

`listAll` now returns the **union** of:

- all targets you **own** (`by_userId`), and  
- when you have a team, all targets in the **current** team pool (`by_teamId`),

deduped by id — same idea as **`getVisibleWatchTargetIds`**.

## Optional data hygiene

If you want owned targets to **participate in the team pool** for teammates (shared `teamId`), you can patch `watchTargets.teamId` to match your current `users.teamId` for rows where `userId` is you. That’s a separate migration; visibility no longer depends on it.
