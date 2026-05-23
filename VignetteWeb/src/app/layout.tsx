import type { Metadata } from "next";

import { TRPCProvider } from "@/trpc/client";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vignette",
  description: "A multi-creator AI video platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="font-sans"
      >
        <TRPCProvider>
          <Toaster />
          {children}
        </TRPCProvider>
      </body>
    </html>
  );
}
