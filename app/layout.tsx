import type { Metadata, Viewport } from "next";
import { Inter, Sora, Space_Mono } from "next/font/google";
import { MotionProvider } from "@/components/motion";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clipr — AI video clipping for creators",
  description:
    "Turn long videos into viral clips. AI clipping, faceless videos, hooks and animated captions — built by RN Studio.",
};

// Mobile-first viewport: scales correctly on phones/tablets and lets users zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0e1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sora.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-clipr-bg text-clipr-text">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
