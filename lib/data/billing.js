function rowFromRpc(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function sessionToken(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data?.session?.access_token;
  if (!token) {
    throw new Error("Your secure session has expired. Please sign in again.");
  }

  return token;
}

export async function fetchWorkspaceAccess(supabase, organizationId) {
  const [{ data, error }, billingState] = await Promise.all([
    supabase.rpc("get_workspace_access", {
      p_organization_id: organizationId,
    }),
    supabase
      .from("organizations")
      .select("stripe_customer_id,stripe_subscription_id")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  if (error) throw error;
  if (billingState.error) throw billingState.error;

  const access = rowFromRpc(data);
  if (!access) return null;

  return {
    ...access,
    has_stripe_customer: Boolean(billingState.data?.stripe_customer_id),
    has_stripe_subscription: Boolean(billingState.data?.stripe_subscription_id),
  };
}

export async function activateWorkspaceMode(supabase, organizationId, mode) {
  const rpc = mode === "trial" ? "start_workspace_trial" : "choose_free_plan";
  const { error } = await supabase.rpc(rpc, {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return fetchWorkspaceAccess(supabase, organizationId);
}

export async function startWorkspaceTrial(supabase, organizationId) {
  const { error } = await supabase.rpc("start_workspace_trial", {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return fetchWorkspaceAccess(supabase, organizationId);
}

export async function createBillingCheckout(
  supabase,
  { organizationId, plan, interval }
) {
  const token = await sessionToken(supabase);
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      organizationId,
      plan,
      interval,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || "Could not start Stripe Checkout.");
  }
  if (!payload?.url) {
    throw new Error("Stripe Checkout URL was not returned.");
  }

  return payload.url;
}

export async function createBillingPortal(supabase, organizationId) {
  const token = await sessionToken(supabase);
  const response = await fetch("/api/billing/portal", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ organizationId }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || "Could not open the billing portal.");
  }
  if (!payload?.url) {
    throw new Error("Billing portal URL was not returned.");
  }

  return payload.url;
}
