import type { Metadata } from 'next';
import './globals.css';
import './ai.css';

export const metadata: Metadata = {
  title: '知序 · 让知识有据可循',
  description: '把散落的课程资料，变成有出处的理解、可验证的练习和属于你的学习路径。',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
