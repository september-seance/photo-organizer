import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = { title: "SnapSort — Identity & Prototype", description: "Photo Organizer reimagined for people coming from Windows. No terminal, ever. Drop, preview, sort resale photos into listing-ready folders." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
