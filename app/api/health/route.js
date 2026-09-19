export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "metrixiq",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      version: process.env.VERCEL_GIT_COMMIT_SHA || null,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
