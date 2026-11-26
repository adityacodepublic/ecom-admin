/**
 * What a Google Search Console "HTML tag" verification looks like. Shared by the settings form (checks as you type)
 * and the server (lib/store-settings.ts), so both accept the same values. No database import: safe in the browser.
 *
 * Search Console > Add property > URL prefix > HTML tag gives:
 *   <meta name="google-site-verification" content="abc123..." />
 * The owner may paste that whole tag or only the content value (the token).
 */

/** The content value of the tag: letters, digits, "_" and "-" (base64url), 20 to 100 characters. */
export const GOOGLE_VERIFICATION_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
export const GOOGLE_VERIFICATION_TOKEN_ERROR =
  "That does not look like a Google verification code. Copy the whole <meta> tag again from Search Console > HTML tag";
export const GOOGLE_VERIFICATION_NAME_ERROR = 'That is not the Search Console tag. Paste the <meta name="google-site-verification" ...> tag';

/** The longest text accepted (a pasted tag with some extra spaces). */
export const GOOGLE_VERIFICATION_MAX_INPUT = 500;

const META_TAG = /^<meta\b([^>]*)\/?>$/i;
const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs);
  return m ? (m[1] ?? m[2] ?? "").trim() : null;
};

export type GoogleVerificationResult = { ok: true; token: string } | { ok: false; error: string };

/**
 * The verification token from what the owner pasted: "" (removes it), the token itself, or the whole
 * <meta name="google-site-verification" content="..."> tag (double or single quotes).
 */
export function extractGoogleVerificationToken(raw: string): GoogleVerificationResult {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, token: "" };
  if (text.length > GOOGLE_VERIFICATION_MAX_INPUT) return { ok: false, error: GOOGLE_VERIFICATION_TOKEN_ERROR };

  let token = text;
  if (text.startsWith("<")) {
    const tag = META_TAG.exec(text);
    if (!tag) return { ok: false, error: GOOGLE_VERIFICATION_TOKEN_ERROR };
    const name = attr(tag[1], "name");
    if (name?.toLowerCase() !== "google-site-verification") return { ok: false, error: GOOGLE_VERIFICATION_NAME_ERROR };
    const content = attr(tag[1], "content");
    if (!content) return { ok: false, error: GOOGLE_VERIFICATION_TOKEN_ERROR };
    token = content;
  }
  return GOOGLE_VERIFICATION_TOKEN.test(token) ? { ok: true, token } : { ok: false, error: GOOGLE_VERIFICATION_TOKEN_ERROR };
}
