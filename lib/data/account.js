export async function updateMyProfile(supabase, fullName) {
  const { data, error } = await supabase.rpc("update_my_profile", { p_full_name: fullName });
  if (error) throw error;
  return data;
}

export async function updateMyPassword(supabase, password) {
  if (!password || password.length < 8) throw new Error("Password must contain at least 8 characters.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOutAllSessions(supabase) {
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) throw error;
}

export async function deleteMyAccount(supabase) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const userId = data?.session?.user?.id;
  if (!token || !userId) throw new Error("Authentication required.");
  const response = await fetch("/api/admin/users/delete", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId, self: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not delete your account.");
  return payload;
}
