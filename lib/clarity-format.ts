/**
 * What a Clarity project id and a Data Export API token look like. Shared by the settings form (checks as you type)
 * and the server (lib/store-settings.ts), so both accept the same values. No database import: safe in the browser.
 */

/** For example "zg7vtqkayo" (Clarity > Settings > Overview). It goes into a script URL, so only letters and digits. */
export const CLARITY_PROJECT_ID = /^[a-z0-9]{6,20}$/;
export const CLARITY_PROJECT_ID_ERROR = "A Clarity project id has only letters and numbers, for example zg7vtqkayo";

/** Clarity > Settings > Data Export. A JWT: letters, digits and . _ - (and base64 signs) only. */
export const CLARITY_API_TOKEN = /^[A-Za-z0-9._~+/=-]{20,4000}$/;
export const CLARITY_API_TOKEN_ERROR = "That does not look like a Clarity API token. Copy it again from Clarity > Settings > Data Export";
