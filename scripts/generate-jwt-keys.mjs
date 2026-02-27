#!/usr/bin/env node
/**
 * Generates an RS256 key pair for Convex custom JWT auth.
 * Writes the public key to convex/jwks-public.json and prints the private key.
 * Add the printed private key to .env.local as CONVEX_JWT_PRIVATE_KEY.
 * For shared deployments, share the private key securely (e.g. 1Password); do not commit it.
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "convex", "jwks-public.json");

async function main() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    crv: undefined,
  });
  const jwk = await exportJWK(publicKey);
  const kid = "compass-" + Date.now();
  const jwks = {
    keys: [{ ...jwk, use: "sig", alg: "RS256", kid }],
  };
  writeFileSync(outPath, JSON.stringify(jwks, null, 2), "utf-8");
  const pem = await exportPKCS8(privateKey);
  console.log("Public JWKS written to convex/jwks-public.json");
  console.log("");
  console.log("Add this to .env.local (do not commit):");
  console.log("CONVEX_JWT_PRIVATE_KEY=\"\"\"");
  console.log(pem);
  console.log("\"\"\"");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
