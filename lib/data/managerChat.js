export async function fetchManagerChatMessages(supabase, organizationId, site = null, limit = 100) {
  let query = supabase.from("manager_chat_messages").select("id,organization_id,site,sender_id,body,created_at,edited_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(limit);
  query = site ? query.eq("site", site) : query.is("site", null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []).reverse();
  const ids = [...new Set(rows.map(r => r.sender_id).filter(Boolean))];
  let names = {};
  if (ids.length) {
    const { data: profiles } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
    names = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || p.email || "Manager"]));
  }
  return rows.map(r => ({ ...r, sender_name: names[r.sender_id] || "Manager" }));
}
export async function sendManagerChatMessage(supabase, { organizationId, site = null, body }) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError || new Error("Authentication required.");
  const { data, error } = await supabase.from("manager_chat_messages").insert({ organization_id: organizationId, site: site || null, sender_id: userData.user.id, body: String(body || "").trim() }).select("id").single();
  if (error) throw error;
  return data;
}

export async function fetchOrganizationChatMembers(supabase, organizationId) {
  const { data: memberships, error } = await supabase.from("organization_members").select("user_id,role,site_scope").eq("organization_id", organizationId);
  if (error) throw error;
  const ids=(memberships||[]).map(m=>m.user_id);
  let profiles=[];
  if(ids.length){const res=await supabase.from("profiles").select("id,full_name,email").in("id",ids);if(res.error)throw res.error;profiles=res.data||[];}
  const byId=Object.fromEntries(profiles.map(p=>[p.id,p]));
  return (memberships||[]).map(m=>({...m,...byId[m.user_id],id:m.user_id}));
}
export async function fetchDirectMessages(supabase, organizationId, otherUserId, myUserId) {
  const {data,error}=await supabase.from("manager_direct_messages").select("*").eq("organization_id",organizationId).or(`and(sender_id.eq.${myUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${myUserId})`).order("created_at",{ascending:true}).limit(200);
  if(error)throw error; return data||[];
}
export async function sendDirectMessage(supabase,{organizationId,recipientId,body}) {
  const {data:userData,error:userError}=await supabase.auth.getUser();if(userError||!userData.user)throw userError||new Error("Authentication required.");
  const {error}=await supabase.from("manager_direct_messages").insert({organization_id:organizationId,sender_id:userData.user.id,recipient_id:recipientId,body:String(body||"").trim()});if(error)throw error;
}
