import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
import { AccountProvider } from "@/components/account-provider";
export const metadata: Metadata = {
  title: {
    default: "브레인 랩 | 나를 발견하는 두뇌 연구소",
    template: "%s | 브레인 랩",
  },
  description:
    "기억하고, 추리하고, 연결하며. 짧은 게임과 해설로 나만의 해결 전략을 발견하는 두뇌 연구소.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <AccountProvider>
          <Shell>{children}</Shell>
        </AccountProvider>
      </body>
    </html>
  );
}
