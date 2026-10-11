import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commit Watch — Weekly class activity",
  description: "A private weekly GitHub contribution monitor for student classes.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <html lang="en"><body>{children}</body></html>;
}
