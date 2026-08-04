import { cache } from "react";
import { getLeagueBySlug, getLeaguePublicInfo } from "@/lib/actions/leagues";

/**
 * Per-request deduped league fetchers. The league layout, page,
 * and generateMetadata all call these; React.cache collapses them
 * into a single query per request.
 */
export const getLeagueCached = cache(getLeagueBySlug);
export const getLeaguePublicInfoCached = cache(getLeaguePublicInfo);
