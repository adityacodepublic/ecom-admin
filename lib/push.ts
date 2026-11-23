import { randomUUID } from "crypto";

/**
 * Web push through OneSignal (REST API). Two OneSignal apps, because one app serves one website:
 *   "admin"  the store owners, on this admin app      NEXT_PUBLIC_ONESIGNAL_APP_ID + ONESIGNAL_REST_API_KEY
 *   "store"  the shoppers, on the store app            ONESIGNAL_STORE_APP_ID + ONESIGNAL_STORE_REST_API_KEY
 * Both send from here (the orders are written here), so both REST keys live only in this app's server env.
 * People are found by their External ID = their Clerk user id (the browsers call OneSignal.login with it).
 * A missing key turns that app's push off quietly. Never throws: a push problem must not fail an order.
 */
export type PushApp = "admin" | "store";

const ENDPOINT = "https://api.onesignal.com/notifications";
const TIMEOUT_MS = 8000;

function credentials(app: PushApp) {
  const appId = (app === "admin" ? process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID : process.env.ONESIGNAL_STORE_APP_ID)?.trim();
  const key = (app === "admin" ? process.env.ONESIGNAL_REST_API_KEY : process.env.ONESIGNAL_STORE_REST_API_KEY)?.trim();
  return appId && key ? { appId, key } : null;
}

export const pushConfigured = (app: PushApp) => credentials(app) !== null;

export type Push = {
  to: string[]; // Clerk user ids (External IDs)
  title: string;
  message: string;
  url: string; // absolute: opened when the notification is clicked
  topic?: string; // a newer push with the same topic replaces the older one on the device
};

/** Sends one push. True when OneSignal took it (also when nobody is subscribed: it just reaches no one). */
export async function sendPush(app: PushApp, push: Push): Promise<boolean> {
  const c = credentials(app);
  const to = push.to.filter(Boolean);
  if (!c || to.length === 0) return false;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Key ${c.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: c.appId,
        target_channel: "push",
        include_aliases: { external_id: to },
        headings: { en: push.title },
        contents: { en: push.message },
        url: push.url,
        ...(push.topic ? { web_push_topic: push.topic } : {}),
        idempotency_key: randomUUID(),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) return true;
    console.error(`[PUSH] ${app} OneSignal ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } catch (error) {
    console.error(`[PUSH] ${app}`, error instanceof Error ? error.message : error);
  }
  return false;
}
