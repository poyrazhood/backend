import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tecrubelerim - Güvendiğin İşletmeyi Keşfet",
  description: "Türkiye'nin güvenilir işletme değerlendirme platformu. Gerçek kullanıcı yorumları ve güven puanları ile doğru kararlar verin.",
  keywords: "işletme yorumları, güvenilir yorumlar, müşteri deneyimleri, işletme değerlendirme",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
