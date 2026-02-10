import type { Metadata } from "next";
import { getLeaguePublicInfo } from "@/lib/actions/leagues";

interface Props {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeaguePublicInfo(slug);
  if (!league) {
    return { title: "Team Sign Up" };
  }
  return {
    title: `Sign Up - ${league.name}`,
    description: `Register your team for ${league.name}`,
  };
}

export default function SignupLayout({ children }: Props) {
  return children;
}
