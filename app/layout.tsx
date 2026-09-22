import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EarthView",
  description: "A real-time view of Earth",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
