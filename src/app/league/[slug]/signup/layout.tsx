import type { Metadata } from "next";
import { getLeaguePublicInfo } from "@/lib/actions";

interface Props {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const league = await getLeaguePublicInfo(slug);
    return {
      title: `Sign Up - ${league.name}`,
      description: `Register your team for ${league.name}`,
    };
  } catch {
    return { title: "Team Sign Up" };
  }
}

export default function SignupLayout({ children }: Props) {
  return children;
}
