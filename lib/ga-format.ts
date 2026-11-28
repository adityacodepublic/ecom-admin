/**
 * What a Google Analytics 4 measurement id looks like. Shared by the settings form (checks as you type) and the
 * server (lib/store-settings.ts), so both accept the same values. No database import: safe in the browser.
 */

/** For example "G-ABC123DEF4" (GA4 > Admin > Data streams > Web). The store writes it into a script, so only G-, letters and digits. */
export const GA_MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;
export const GA_MEASUREMENT_ID_ERROR =
  "A GA4 Measurement ID starts with G-, for example G-ABC123DEF4. GTM- (Tag Manager), GT- (Google tag) and UA- (old Universal Analytics) ids do not work here";

/** The id as stored: no spaces, upper case. */
export const normalizeGaMeasurementId = (raw: string) => raw.trim().toUpperCase();
