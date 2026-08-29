import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kampfgericht Schulung - Basketball",
  description: "Echtzeit-Schulungs-Simulator für Basketball Kampfgerichts-Bedienpulte",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
