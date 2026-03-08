import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AlmostCrackd Admin",
  description: "Protected analytics and content administration for staging data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
