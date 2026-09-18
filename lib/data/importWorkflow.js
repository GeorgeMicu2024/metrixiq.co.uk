import { persistAnalysis } from "../persistence";
import { refreshWorkspacePerformance } from "./workspace";

export async function persistWorkspaceImport({
  supabase,
  organizationId,
  analysis,
  files,
}) {
  if (!organizationId) throw new Error("Workspace is not ready yet.");

  const saved = await persistAnalysis({
    organizationId,
    analysis,
    files,
  });

  const { error: syncError } = await supabase.rpc("sync_driver_directory", {
    p_organization_id: organizationId,
  });

  if (syncError) throw syncError;

  const { scorecards, metricRows } = await refreshWorkspacePerformance(
    supabase,
    organizationId
  );

  return {
    saved,
    scorecards,
    metricRows,
  };
}
