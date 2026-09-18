export async function fetchCdfWorkspaceData(supabase, organizationId) {
  const [eventsResult, cardsResult] = await Promise.all([
    supabase
      .from("feedback_events")
      .select("*,drivers(trid,full_name,site)")
      .eq("organization_id", organizationId)
      .order("feedback_date", { ascending: false })
      .limit(10000),
    supabase
      .from("site_scorecards")
      .select("id,site,year,week,week_label,metrics")
      .eq("organization_id", organizationId)
      .order("year", { ascending: false })
      .order("week", { ascending: false }),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (cardsResult.error) throw cardsResult.error;

  return {
    events: eventsResult.data || [],
    cards: cardsResult.data || [],
  };
}
