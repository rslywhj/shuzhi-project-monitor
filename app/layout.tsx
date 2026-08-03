import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "数智军团 · 统建项目进度监控平台";
const description = "统一节点、预测预警、管理闭环——面向统建项目组合的红黄绿进度监控平台。";
const themeBootstrapScript = `(function(){try{var p=localStorage.getItem("shuzhi-color-scheme-v1");var t=p==="light"||p==="dark"?p:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var s=Number(localStorage.getItem("shuzhi-font-scale-v1"));s=[1,1.1,1.2,1.3,1.4].indexOf(s)>=0?s:1.1;document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;document.documentElement.style.setProperty("--ui-font-scale",String(s))}catch(e){}})();`;

export const metadata: Metadata = {
  title,
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title, description, type: "website", images: [{ url: "/og.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06131f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} /></head><body>{children}</body></html>;
}
