import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "misu — 내 하루의 마지막 대화",
  description: "진짜 남자친구처럼 일상을 공유하는 AI 채팅",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="h-full bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
