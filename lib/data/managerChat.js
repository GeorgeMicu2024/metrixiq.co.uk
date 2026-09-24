export async function fetchManagerChatMessages(supabase, organizationId, site = null, limit = 100) {
  let query = supabase.from("manager_chat_messages").select("id,organization_id,site,sender_id,body,created_at,edited_at,reply_to_id,deleted_at,attachment_path,attachment_name,attachment_type,attachment_size").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(limit);
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
export async function sendManagerChatMessage(supabase, { organizationId, site = null, body, replyToId = null, attachment = null }) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError || new Error("Authentication required.");
  const { data, error } = await supabase.from("manager_chat_messages").insert({ organization_id: organizationId, site: site || null, sender_id: userData.user.id, body: String(body || "").trim() || (attachment ? "Attachment" : ""), reply_to_id: replyToId, attachment_path:attachment?.path||null,attachment_name:attachment?.name||null,attachment_type:attachment?.type||null,attachment_size:attachment?.size||null }).select("id").single();
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

export async function fetchDirectUnreadCounts(supabase, organizationId, myUserId) {
  const {data,error}=await supabase.from("manager_direct_messages").select("sender_id").eq("organization_id",organizationId).eq("recipient_id",myUserId).is("read_at",null);
  if(error)throw error;return (data||[]).reduce((a,r)=>{a[r.sender_id]=(a[r.sender_id]||0)+1;return a},{});
}
export async function markDirectMessagesRead(supabase, organizationId, otherUserId, myUserId) {
  const {error}=await supabase.from("manager_direct_messages").update({read_at:new Date().toISOString()}).eq("organization_id",organizationId).eq("sender_id",otherUserId).eq("recipient_id",myUserId).is("read_at",null);
  if(error)throw error;
}

export async function createChatMentions(supabase,{organizationId,messageId,mentionedBy,mentionedUserIds=[]}) {
 const rows=[...new Set(mentionedUserIds)].filter(id=>id&&id!==mentionedBy).map(id=>({organization_id:organizationId,message_id:messageId,mentioned_user_id:id,mentioned_by:mentionedBy}));
 if(!rows.length)return;const {error}=await supabase.from("manager_chat_mentions").upsert(rows,{onConflict:"message_id,mentioned_user_id",ignoreDuplicates:true});if(error)throw error;
}
export async function fetchUnreadMentionCount(supabase,organizationId,userId){
 const {count,error}=await supabase.from("manager_chat_mentions").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("mentioned_user_id",userId).is("read_at",null);if(error)throw error;return count||0;
}
export async function markMentionsRead(supabase,organizationId,userId){
 const {error}=await supabase.from("manager_chat_mentions").update({read_at:new Date().toISOString()}).eq("organization_id",organizationId).eq("mentioned_user_id",userId).is("read_at",null);if(error)throw error;
}

export async function editChatMessage(supabase,messageId,body){const {error}=await supabase.from("manager_chat_messages").update({body:String(body||"").trim(),edited_at:new Date().toISOString()}).eq("id",messageId);if(error)throw error}
export async function deleteChatMessage(supabase,messageId){const {error}=await supabase.from("manager_chat_messages").update({body:"",deleted_at:new Date().toISOString(),edited_at:new Date().toISOString()}).eq("id",messageId);if(error)throw error}
export async function fetchChatReactions(supabase,organizationId,messageIds){if(!messageIds?.length)return[];const {data,error}=await supabase.from("manager_chat_reactions").select("*").eq("organization_id",organizationId).in("message_id",messageIds);if(error)throw error;return data||[]}
export async function toggleChatReaction(supabase,{organizationId,messageId,userId,emoji,active}){if(active){const {error}=await supabase.from("manager_chat_reactions").delete().eq("message_id",messageId).eq("user_id",userId).eq("emoji",emoji);if(error)throw error}else{const {error}=await supabase.from("manager_chat_reactions").insert({organization_id:organizationId,message_id:messageId,user_id:userId,emoji});if(error)throw error}}

export async function uploadChatAttachment(supabase,{organizationId,userId,file}){
 if(!file)throw new Error("Choose a file.");if(file.size>10*1024*1024)throw new Error("Maximum attachment size is 10 MB.");
 const safe=String(file.name||"file").replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${organizationId}/${userId}/${Date.now()}-${safe}`;
 const {error}=await supabase.storage.from("manager-chat").upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return{path,name:file.name,type:file.type,size:file.size};
}
export async function createChatAttachmentUrl(supabase,path){const {data,error}=await supabase.storage.from("manager-chat").createSignedUrl(path,300);if(error)throw error;return data.signedUrl}
