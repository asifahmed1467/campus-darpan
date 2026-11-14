import type { Metadata, Viewport } from "next";
import Shell from "@/components/Shell";
import { LangProvider } from "@/lib/i18n";
import "@fontsource-variable/bricolage-grotesque/index.css";
import "@fontsource/hind-siliguri/400.css";
import "@fontsource/hind-siliguri/500.css";
import "@fontsource/hind-siliguri/600.css";
import "@fontsource/hind-siliguri/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ক্যাম্পাসদর্পণ | Your Campus, Connected.", template: "%s | ক্যাম্পাসদর্পণ" },
  description: "AIUB-এর সকল একাডেমিক তথ্য, এক ঠিকানায়। Live notices, teacher free time and answers with sources, for AIUB students.",
  applicationName: "ক্যাম্পাসদর্পণ",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#0B2A6F", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("cd-theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body>
        <LangProvider><Shell>{children}</Shell></LangProvider>
      </body>
    </html>
  );
}
