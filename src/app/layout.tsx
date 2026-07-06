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
  // 키보드가 올라오면 화면을 밀어올리지 않고 레이아웃 자체를 줄임 (Android/Chrome)
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="h-full bg-gradient-to-b from-rose-50 via-purple-50/70 to-amber-50/60 text-zinc-800">
        {children}
      </body>
    </html>
  );
}
