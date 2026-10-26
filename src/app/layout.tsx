import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taste Twin — Your taste. Your next weekend.",
  description: "Turn your favourite films, artists, books and dishes into a weekend of new discoveries. Every recommendation comes with a taste receipt, powered by Qloo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
