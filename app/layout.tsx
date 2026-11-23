import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";

import { ModalProvider } from "@/providers/modal-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { PushIdentity } from "@/components/push/push-identity";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Dashboard",
  description: "E-Commerce Dashboard",
  // Same icons as the store.
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/storelogo.png", type: "image/png", sizes: "512x512" }],
    apple: "/app-icon/180.png", // the Home Screen icon (app/manifest.ts is the app itself)
  },
  appleWebApp: { capable: true, title: "Admin", statusBarStyle: "default" as const },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <ToastProvider />
            <ModalProvider />
            <PushIdentity />
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
