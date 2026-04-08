/**
 * Shared QR token parsing utility.
 * Used by both Bar.tsx (bar redemption) and HybridQRScannerPanel (hybrid POS).
 */
export type QRTokenType = 'pickup' | 'courtesy';

export function parseQRToken(raw: string): { valid: boolean; token: string; type: QRTokenType } {
  const trimmed = raw.trim();

  // 6-digit numeric short code (manual entry) → pickup
  if (/^\d{6}$/.test(trimmed)) {
    return { valid: true, token: trimmed, type: 'pickup' };
  }

  // COURTESY: prefix → courtesy QR
  if (trimmed.toUpperCase().startsWith("COURTESY:")) {
    const code = trimmed.substring(9).trim();
    if (code.length > 0) {
      return { valid: true, token: code, type: 'courtesy' };
    }
    return { valid: false, token: "", type: 'courtesy' };
  }

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
    return { valid: true, token, type: 'pickup' };
  return { valid: false, token: "", type: 'pickup' };
}
