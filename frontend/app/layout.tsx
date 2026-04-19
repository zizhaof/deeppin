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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* 在 hydration 之前读取 localStorage 并设置主题 class，防止页面闪烁 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var s=localStorage.getItem('deeppin:theme');var t=s?JSON.parse(s).state?.theme:'system';if(t==='dark')document.documentElement.classList.add('dark');else if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();`,
        }}
      />
      {/*
        首屏前根据浏览器语言预填 localStorage，zustand 水合时就是浏览器语言。
        无存储值 → 从 navigator.languages 选最接近的支持 locale，命中写入；未命中默认 en。
        Prime localStorage with the detected browser locale before first render so zustand
        rehydrates into it. If no stored value, pick the best-matching supported locale from
        navigator.languages; otherwise leave default "en".
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{if(localStorage.getItem('deeppin:lang'))return;var supported=['en','zh','ja','ko','es','fr','de','pt','ru'];var prefs=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'']);var picked='en';for(var i=0;i<prefs.length;i++){var code=(prefs[i]||'').toLowerCase().split('-')[0];if(supported.indexOf(code)!==-1){picked=code;break;}}localStorage.setItem('deeppin:lang',JSON.stringify({state:{lang:picked},version:0}));}catch(e){}})();`,
        }}
      />
      <body className="min-h-full flex flex-col bg-base">{children}</body>
    </html>
  );
}
