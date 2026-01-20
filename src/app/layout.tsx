import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "C2C MVP",
  description: "중고거래와 경매 MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
