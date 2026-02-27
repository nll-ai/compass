"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

export async function signOutAction() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnTo = `${baseUrl.replace(/\/$/, "")}/`;
  await signOut({ returnTo });
}
