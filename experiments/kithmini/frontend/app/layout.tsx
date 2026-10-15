import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SolarView — Site assessment",
  description:
    "Fisheye sky and obstacle segmentation for solar orientation research.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
