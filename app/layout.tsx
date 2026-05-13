import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yangın izleme",
  description: "ESP sensör durumu izleme",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
