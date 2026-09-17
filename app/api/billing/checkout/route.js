import { PRICE_MAP, getStripe, requireWorkspaceBillingUser, responseError } from "../../../../lib/billing/stripeServer";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "");
    const plan = String(body?.plan || "");
    const interval = body?.interval === "year" ? "year" : "month";

    if (!organizationId) {
      return Response.json({ error: "Workspace is required." }, { status: 400 });
    }

    if (!PRICE_MAP[plan]) {
      return Response.json({ error: "Invalid subscription plan." }, { status: 400 });
    }

    const { user, organization } = await requireWorkspaceBillingUser(request, organizationId);

    if (organization.suspended_at) {
      return Response.json({ error: "This workspace is suspended." }, { status: 403 });
    }

    if (
      organization.stripe_subscription_id &&
      ["active", "past_due"].includes(String(organization.subscription_status || ""))
    ) {
      return Response.json(
        { error: "This workspace already has a Stripe subscription. Use Manage subscription." },
        { status: 409 }
      );
    }

    const stripe = getStripe();
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const price = PRICE_MAP[plan][interval];

    const params = {
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: organizationId,
      success_url: `${origin}/app?billing=success`,
      cancel_url: `${origin}/app?billing=cancelled`,
      metadata: {
        organization_id: organizationId,
        plan,
        interval,
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          plan,
          interval,
        },
      },
    };

    if (organization.stripe_customer_id) {
      params.customer = organization.stripe_customer_id;
    } else if (user.email) {
      params.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(params);

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error", error);
    return responseError(error);
  }
}
