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
