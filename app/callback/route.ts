import { handleAuth, signOut } from "@workos-inc/authkit-nextjs";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export const GET = handleAuth({
  returnPathname: "/dashboard",
  onSuccess: async ({ user }) => {
    if (!isEmailAllowed(user?.email)) {
      await signOut({ returnTo: "/sign-in?error=not-allowed" });
    }
  },
});
