import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carnik",
  description: "Pedidos por WhatsApp para carnicerías, redactados por AI y confirmados por una persona.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
