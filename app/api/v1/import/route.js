import { analyseFiles } from "../../../../lib/analyzer";
import { persistAnalysisWithClient } from "../../../../lib/persistence";
import { authenticatePublicApi, apiError, recordApiResult } from "../../../../lib/integrations/serverV9";

export const runtime = "nodejs";

const ALLOWED = new Set(["csv","xlsx","json"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 10;

function extension(name) {
  return String(name || "").toLowerCase().split(".").pop() || "";
}

export async function POST(request) {
  let context;
  try {
    context = await authenticatePublicApi(request, "imports:write");
    const { admin, auth } = context;

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      const error = new Error("Import Gateway expects multipart/form-data with file or files fields.");
      error.statusCode = 415;
      throw error;
    }

    const form = await request.formData();
    const files = [...form.getAll("files"), ...form.getAll("file")]
      .filter((item) => item && typeof item.arrayBuffer === "function");

    if (!files.length) {
      const error = new Error("At least one CSV, XLSX or JSON file is required.");
      error.statusCode = 400;
      throw error;
    }
    if (files.length > MAX_FILES) {
      const error = new Error("A maximum of 10 files can be imported per API request.");
      error.statusCode = 413;
      throw error;
    }

    let total = 0;
    for (const file of files) {
      const ext = extension(file.name);
      if (!ALLOWED.has(ext)) {
        const error = new Error("Import Gateway supports CSV, XLSX and JSON only. Unsupported: " + file.name);
        error.statusCode = 415;
        throw error;
      }
      if (!file.size || file.size > MAX_FILE_BYTES) {
        const error = new Error(file.name + " exceeds the 20 MB per-file limit or is empty.");
        error.statusCode = 413;
        throw error;
      }
      total += file.size;
    }
    if (total > MAX_TOTAL_BYTES) {
      const error = new Error("Combined import payload exceeds the 50 MB request limit.");
      error.statusCode = 413;
      throw error;
    }

    const analysis = await analyseFiles(files);
    if (!analysis?.recognizedFiles) {
      const error = new Error("No supported MetrixIQ report structure was detected.");
      error.statusCode = 422;
      throw error;
    }

    const saved = await persistAnalysisWithClient({
      supabase: admin,
      organizationId: auth.organization_id,
      analysis,
      files,
    });

    await admin.rpc("sync_driver_directory", {
      p_organization_id: auth.organization_id,
    }).catch(() => null);

    await admin.rpc("run_automation_engine", {
      p_organization_id: auth.organization_id,
      p_force: false,
      p_source: "api_import_completed",
    }).catch(() => null);

    await admin.rpc("emit_webhook_event", {
      p_organization_id: auth.organization_id,
      p_event_type: "import.completed",
      p_event_key: "api:" + Date.now(),
      p_source_type: "api_import",
      p_source_id: auth.api_key_id,
      p_payload: {
        files: files.map((file) => file.name),
        recognized_files: analysis.recognizedFiles,
        driver_count: analysis.driverCount,
        saved,
      },
    }).catch(() => null);

    const body = {
      ok: true,
      organization_id: auth.organization_id,
      analysis: {
        files: analysis.fileResults,
        recognized_files: analysis.recognizedFiles,
        periods: analysis.periods?.map((period) => ({
          week_label: period.weekLabel,
          period_start: period.periodStart,
          period_end: period.periodEnd,
          driver_count: period.driverCount,
        })) || [],
        driver_count: analysis.driverCount,
        unmatched_drivers: analysis.unmatchedDrivers,
      },
      saved,
    };
    await recordApiResult(admin, auth, body, false);
    return Response.json(body, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (context?.admin && context?.auth) await recordApiResult(context.admin, context.auth, { error: error?.message }, true);
    return apiError(error);
  }
}
