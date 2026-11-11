import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoboEduc Game Lab",
  description: "Ambiente de aprendizagem e projetos de desenvolvimento de jogos da RoboEduc.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
