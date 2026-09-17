import { PRICE_TO_PLAN, getStripe, getSupabaseAdmin } from "../../../../lib/billing/stripeServer";

export const runtime = "nodejs";

function stripeStatusToDatabase(status) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  return "past_due";
}

async function findOrganizationId(admin, subscription) {
  const fromMetadata = subscription?.metadata?.organization_id;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) return null;

  const { data } = await admin
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data?.id || null;
}

async function syncSubscription(admin, subscription) {
  const organizationId = await findOrganizationId(admin, subscription);
  if (!organizationId) return;

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id || "";
  const priceInfo = PRICE_TO_PLAN[priceId] || null;

  const metadataPlan = String(subscription.metadata?.plan || "");
  const plan = ["pro", "business", "full"].includes(metadataPlan)
    ? metadataPlan
    : priceInfo?.plan || "free";

  const status = stripeStatusToDatabase(subscription.status);

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id || null;

  const patch = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: status,
    onboarding_completed: true,
    billing_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (status === "active") {
    patch.plan = plan;
    patch.trial_started_at = null;
    patch.trial_ends_at = null;
  } else if (status === "cancelled") {
    patch.plan = "free";
  } else {
    patch.plan = plan;
  }

  const { error } = await admin
    .from("organizations")
    .update(patch)
    .eq("id", organizationId);

  if (error) throw error;
}

export async function POST(request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return Response.json({ error: "STRIPE_WEBHOOK_SECRET is not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature error", error);
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
        await syncSubscription(admin, subscription);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscription(admin, event.data.object);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing error", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
