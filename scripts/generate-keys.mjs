// Prints Convex Auth JWT keys (JWT_PRIVATE_KEY, JWKS) as JSON. Never commit the output.
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });
process.stdout.write(JSON.stringify({ JWT_PRIVATE_KEY: privateKey.trimEnd().replace(/\n/g, " "), JWKS: jwks }));
