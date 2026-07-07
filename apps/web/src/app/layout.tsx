import type { Metadata } from "next";
import "./globals.css";

import { getMetaCached, getSession } from "@/lib/session";
import { Providers } from "@/components/providers";
import { SessionProvider } from "@/components/session-provider";
import { MetaProvider } from "@/components/meta-provider";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: { default: "LinkedOut", template: "%s · LinkedOut" },
  description:
    "LinkedIn for your Ls. The most honest professional network — document the rejections, layoffs, pivots, and the lessons that came from them.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, meta] = await Promise.all([getSession(), getMetaCached()]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a
          href="#main-content"
          className="bg-background focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:px-3 focus:py-2 focus:shadow focus:ring-2"
        >
          Skip to content
        </a>
        <Providers>
          <SessionProvider session={session}>
            <MetaProvider meta={meta}>
              <div className="flex min-h-dvh flex-col">
                <Header />
                <main id="main-content" className="flex-1">{children}</main>
              </div>
            </MetaProvider>
          </SessionProvider>
        </Providers>
      </body>
    </html>
  );
}
