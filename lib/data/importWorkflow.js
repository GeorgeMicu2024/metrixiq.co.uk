import { persistAnalysis } from "../persistence";
import { refreshWorkspacePerformance } from "./workspace";
import { refreshCommandCenterSummary } from "./commandCenter";

export async function persistWorkspaceImport({
  supabase,
  organizationId,
  analysis,
  files,
  site = null,
}) {
  if (!organizationId) throw new Error("Workspace is not ready yet.");

  const saved = await persistAnalysis({
    organizationId,
    analysis,
    files,
    site,
  });

  const { error: syncError } = await supabase.rpc("sync_driver_directory", {
    p_organization_id: organizationId,
  });

  if (syncError) throw syncError;

  const [{ scorecards, metricRows }, commandCenter] = await Promise.all([
    refreshWorkspacePerformance(supabase, organizationId),
    refreshCommandCenterSummary(supabase, organizationId, { refreshAlerts: true }),
  ]);

  return {
    saved,
    scorecards,
    metricRows,
    commandCenter,
  };
}
