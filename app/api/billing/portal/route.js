import { getStripe, requireWorkspaceBillingUser, responseError } from "../../../../lib/billing/stripeServer";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "");

    if (!organizationId) {
      return Response.json({ error: "Workspace is required." }, { status: 400 });
    }

    const { organization } = await requireWorkspaceBillingUser(request, organizationId);

    if (!organization.stripe_customer_id) {
      return Response.json(
        { error: "No Stripe customer is linked to this workspace yet." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripe_customer_id,
      return_url: `${origin}/app`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Stripe portal error", error);
    return responseError(error);
  }
}
