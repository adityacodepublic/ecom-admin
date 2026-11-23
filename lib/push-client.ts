"use client";

import OneSignal from "react-onesignal";

/**
 * Web push in the owner's browser, through OneSignal (Web SDK v16): new orders, quote requests and answers, customer
 * cancellations and returns (sent by lib/orders/notify.ts with lib/push.ts). The owner turns it on with a tap in
 * Settings (never asked on page load); OneSignal.login(Clerk user id) links this browser to them. It is the admin's own
 * OneSignal app (the shoppers' is the store app's). NEXT_PUBLIC_ONESIGNAL_APP_ID unset = push is off (nothing loads).
 * The service worker is public/OneSignalSDKWorker.js at the site root (the only service worker of the site).
 */

const APP_ID = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? "").trim();
/** Set once this browser turned push on: later visits load OneSignal again to keep the right shopper signed in. */
const FLAG = "push-on";

export const pushConfigured = () => APP_ID !== "";

const remember = (on: boolean) => {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    // private mode: push still works, the next visit just does not re-check the sign-in
  }
};
export const pushRemembered = () => {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
};

let started: Promise<boolean> | null = null;
function start(): Promise<boolean> {
  if (!APP_ID) return Promise.resolve(false);
  started ??= OneSignal.init({
    appId: APP_ID,
    serviceWorkerPath: "OneSignalSDKWorker.js",
    serviceWorkerParam: { scope: "/" },
    allowLocalhostAsSecureOrigin: true,
    autoResubscribe: true,
    welcomeNotification: { disable: true, message: "" },
  })
    .then(() => true)
    .catch((error) => {
      started = null; // a later tap may try again
      throw error;
    });
  return started;
}

export type PushState = { supported: boolean; on: boolean; blocked: boolean };

export async function pushState(): Promise<PushState> {
  if (!(await start())) return { supported: false, on: false, blocked: false };
  return {
    supported: OneSignal.Notifications.isPushSupported(),
    on: OneSignal.User.PushSubscription.optedIn === true && OneSignal.Notifications.permission,
    blocked: OneSignal.Notifications.permissionNative === "denied",
  };
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** Turns push on for this shopper. Call it from a tap. Throws an Error with a message for the shopper. */
export async function enablePush(userId: string): Promise<PushState> {
  if (isIos() && !isStandalone()) {
    throw new Error("On iPhone or iPad: tap Share, then Add to Home Screen. Open the admin from the new icon and turn this on there.");
  }
  if (!(await start())) throw new Error("Notifications are not set up yet.");
  if (!OneSignal.Notifications.isPushSupported()) throw new Error("This browser cannot show notifications. Try Chrome, Edge, Firefox or Safari.");
  await OneSignal.login(userId);
  if (OneSignal.Notifications.permissionNative !== "granted") await OneSignal.Notifications.requestPermission();
  if (OneSignal.Notifications.permissionNative !== "granted") {
    throw new Error(
      OneSignal.Notifications.permissionNative === "denied"
        ? "Notifications are blocked for this site. Allow them in the browser's site settings (the icon left of the address), then try again."
        : "Notifications were not allowed. Try again and choose Allow.",
    );
  }
  await OneSignal.User.PushSubscription.optIn();
  remember(true);
  return pushState();
}

export async function disablePush(): Promise<PushState> {
  if (await start()) await OneSignal.User.PushSubscription.optOut();
  remember(false);
  return pushState();
}

/** Keeps the browser linked to whoever is signed in now (or to nobody after sign-out). Only where push was turned on. */
export async function syncPushUser(userId: string | null) {
  if (!pushRemembered() || !(await start())) return;
  if (userId) await OneSignal.login(userId);
  else await OneSignal.logout();
}
