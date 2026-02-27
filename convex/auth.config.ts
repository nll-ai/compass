import type { AuthConfig } from "convex/server";

// JWKS for Convex to verify our app-issued JWTs. Regenerate with scripts/generate-jwt-keys.mjs;
// after regenerating, replace the object below with the new keys array from convex/jwks-public.json.
const jwksPublic = {
  keys: [
    {
      kty: "RSA",
      n: "yDCGY7cIipwjCt0I0Oe5sSOQTwkGssxO7XjRMsWDmidIffgr74rKSJB2c3H0Gf2awWC_u6OsnaFY_JwvcZFVplq5Sjc3egw7RIXci_tF2eKTMLN4ag224DzN8BA-1KsBbPJPVq1v2S1Gu_xGpygT3VLhJ6Tj4V_K7GIFxq2d7w1L5u9tV54N7fnFReHLQ9rJejI-sxjYTlnLsYMix1gt0XcrhFXa9JJdS9xVvMiEK1cSLq8sMJozDDn5qEh7nJi_JHrgrm96G53VJsGl6uUxjjLLz60f9tHpq6l7wkR3DUdoVAXmOeWD2ncfY-RucaPB9IND7gG9TX46yA9xoa9bjw",
      e: "AQAB",
      use: "sig",
      alg: "RS256",
      kid: "compass-1772162961019",
    },
  ],
};
// Convex runs in V8 isolate (no Node Buffer). Use btoa for base64.
const jwksDataUri =
  "data:text/plain;charset=utf-8;base64," +
  btoa(JSON.stringify(jwksPublic));

// Match app's NEXT_PUBLIC_APP_URL / issuer. Override via Convex dashboard env if needed.
const issuer = "https://compass-five-silk.vercel.app";
const applicationID = "compass-convex";

export default {
  providers: [
    {
      type: "customJwt",
      applicationID,
      issuer,
      jwks: jwksDataUri,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
