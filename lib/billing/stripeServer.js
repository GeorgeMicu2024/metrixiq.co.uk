import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const PRICE_MAP = {
  pro: {
    month: "price_1UBIcxB0v0SQ0vlQCKIUDKEf",
    year: "price_1UBIi3B0v0SQ0vlQgwuj8pUi",
  },
  business: {
    month: "price_1UBIfwB0v0SQ0vlQgO2s12ba",
    year: "price_1UBIiRB0v0SQ0vlQ9QbA0cXu",
  },
  full: {
    month: "price_1UBIgvB0v0SQ0vlQUGfvjknE",
    year: "price_1UBIioB0v0SQ0vlQfziADbkE",
  },
};

export const PRICE_TO_PLAN = Object.fromEntries(
  Object.entries(PRICE_MAP).flatMap(([plan, intervals]) =>
    Object.entries(intervals).map(([interval, price]) => [price, { plan, interval }])
  )
);

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new Stripe(key);
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getSupabaseVerifier() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public credentials are not configured.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireWorkspaceBillingUser(request, organizationId) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const verifier = getSupabaseVerifier();
  const { data: userData, error: userError } = await verifier.auth.getUser(token);

  if (userError || !userData?.user) {
    const error = new Error("Your session is invalid or expired.");
    error.statusCode = 401;
    throw error;
  }

  const admin = getSupabaseAdmin();

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;

  if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
    const error = new Error("You do not have permission to manage billing for this workspace.");
    error.statusCode = 403;
    throw error;
  }

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id,name,plan,subscription_status,stripe_customer_id,stripe_subscription_id,suspended_at")
    .eq("id", organizationId)
    .single();

  if (organizationError) throw organizationError;

  return {
    user: userData.user,
    membership,
    organization,
    admin,
  };
}

export function responseError(error) {
  const status = Number(error?.statusCode) || 500;
  return Response.json(
    { error: error?.message || "Unexpected billing error." },
    { status }
  );
}
