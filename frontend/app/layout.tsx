import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deeppin — 深度思考工具",
  description: "AI 辅助的结构化深度思考，支持子问题追问",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* 在 hydration 之前读取 localStorage 并设置主题 class，防止页面闪烁 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var s=localStorage.getItem('deeppin:theme');var t=s?JSON.parse(s).state?.theme:'system';if(t==='dark')document.documentElement.classList.add('dark');else if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();`,
        }}
      />
      <body className="min-h-full flex flex-col bg-base">{children}</body>
    </html>
  );
}
