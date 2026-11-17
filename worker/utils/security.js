// ==========================================
// UTILS: DOMAIN SECURITY VALIDATION
// ==========================================

export function isTrustedDomain(url, trustedDomains) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return trustedDomains.has(hostname);
  } catch {
    return false;
  }
}