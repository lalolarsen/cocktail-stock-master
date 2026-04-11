/**
 * Shared QR token parsing utility.
 * Used by both Bar.tsx (bar redemption) and HybridQRScannerPanel (hybrid POS).
 */
export function parseQRToken(raw: string): { valid: boolean; token: string } {
  const trimmed = raw.trim();
  console.log("[parseQRToken] raw input:", JSON.stringify(trimmed));

  // 6-digit numeric short code (manual entry)
  if (/^\d{6}$/.test(trimmed)) {
    return { valid: true, token: trimmed };
  }

  let token = "";
  if (trimmed.includes("token=")) {
    const m = trimmed.match(/[?&]token=([a-f0-9]+)/i); if (m) token = m[1];
  } else if (trimmed.includes("/r/")) {
    const m = trimmed.match(/\/r\/([a-f0-9]+)/i); if (m) token = m[1];
  } else if (trimmed.toUpperCase().startsWith("PICKUP:")) {
    token = trimmed.substring(7);
  } else if (/^COURTESY[:\-\s;.]/i.test(trimmed) || trimmed.toUpperCase().startsWith("COURTESY")) {
    const code = trimmed.replace(/^COURTESY[:\-\s;.]?/i, "").trim();
    if (code.length >= 4) return { valid: true, token: `courtesy:${code}` };
  } else {
    const m = trimmed.match(/[a-f0-9]{8,64}/i); if (m) token = m[0];
  }
  token = token.toLowerCase();
  if (token.length >= 12 && token.length <= 64 && /^[a-f0-9]+$/.test(token))
    return { valid: true, token };
  return { valid: false, token: "" };
}
