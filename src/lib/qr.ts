/**
 * Shared QR token parsing utility.
 * Used by both Bar.tsx (bar redemption) and HybridQRScannerPanel (hybrid POS).
 */
export function parseQRToken(raw: string): { valid: boolean; token: string } {
  const trimmed = raw.trim();
  let token = "";
  if (trimmed.includes("token=")) {
    const m = trimmed.match(/[?&]token=([a-f0-9]+)/i); if (m) token = m[1];
  } else if (trimmed.includes("/r/")) {
    const m = trimmed.match(/\/r\/([a-f0-9]+)/i); if (m) token = m[1];
  } else if (trimmed.toUpperCase().startsWith("PICKUP:")) {
    token = trimmed.substring(7);
  } else {
    const m = trimmed.match(/[a-f0-9]{12,64}/i); if (m) token = m[0];
  }
  token = token.toLowerCase();
  if (token.length >= 12 && token.length <= 64 && /^[a-f0-9]+$/.test(token))
    return { valid: true, token };
  return { valid: false, token: "" };
}
