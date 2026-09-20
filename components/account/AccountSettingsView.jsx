"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

async function sessionHeaders(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  return {
    authorization: "Bearer " + token,
    "content-type": "application/json",
  };
}

export default function AccountSettingsView({ platformAdmin=false }) {
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [deleteText,setDeleteText]=useState("");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [avatarUrl,setAvatarUrl]=useState("");

  useEffect(()=>{
    let active=true;
    const supabase=getSupabaseBrowserClient();
    Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]).then(([userResult])=>{
      if(!active)return;
      if(userResult.error)throw userResult.error;
      const user=userResult.data?.user;
      setEmail(user?.email||"");
      setName(user?.user_metadata?.full_name||user?.user_metadata?.name||"");
      setAvatarUrl(user?.user_metadata?.avatar_url||"");
    }).catch((e)=>{if(active)setError(e?.message||"Could not load account settings.");});
    return()=>{active=false;};
  },[]);

  async function uploadAvatar(event){
    const file=event.target.files?.[0];if(!file)return;
    if(!file.type.startsWith("image/"))return setError("Choose an image file.");
    if(file.size>2*1024*1024)return setError("Profile image must be under 2 MB.");
    setBusy("avatar");setError("");
    try{const reader=new FileReader();const data=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const {error}=await getSupabaseBrowserClient().auth.updateUser({data:{avatar_url:data}});if(error)throw error;setAvatarUrl(data);setMessage("Profile photo updated. Refresh the workspace to see it in the header.");}catch(e){setError(e?.message||"Could not update profile photo.");}finally{setBusy("");}
  }

  async function saveProfile(){
    if(!name.trim())return setError("Enter your full name.");
    setBusy("profile");setError("");setMessage("");
    try{
      const {error}=await getSupabaseBrowserClient().auth.updateUser({data:{full_name:name.trim()}});
      if(error)throw error;
      setMessage("Profile updated.");
    }catch(e){setError(e?.message||"Could not update your profile.");}
    finally{setBusy("");}
  }

  async function changePassword(){
    setError("");setMessage("");
    if(password.length<8)return setError("Password must contain at least 8 characters.");
    if(password!==confirmPassword)return setError("Passwords do not match.");

    setBusy("password");
    try{
      const {error}=await getSupabaseBrowserClient().auth.updateUser({password});
      if(error)throw error;
      setPassword("");setConfirmPassword("");
      setMessage("Password updated.");
    }catch(e){setError(e?.message||"Could not update your password.");}
    finally{setBusy("");}
  }

  async function signOut(){
    setBusy("logout");setError("");
    try{
      await getSupabaseBrowserClient().auth.signOut();
      window.location.assign("/login");
    }catch(e){setError(e?.message||"Could not sign out.");setBusy("");}
  }

  async function deleteAccount(){
    if(deleteText!=="DELETE")return setError("Type DELETE exactly to confirm account deletion.");
    if(!window.confirm("Delete this MetrixIQ account permanently? This action cannot be undone."))return;

    setBusy("delete");setError("");setMessage("");
    try{
      const supabase=getSupabaseBrowserClient();
      const response=await fetch("/api/account/delete",{
        method:"POST",
        headers:await sessionHeaders(supabase),
        body:JSON.stringify({confirmation:"DELETE"}),
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.error||"Could not delete your account.");

      await supabase.auth.signOut().catch(()=>null);
      window.location.assign("/login?deleted=1");
    }catch(e){setError(e?.message||"Could not delete your account.");}
    finally{setBusy("");}
  }

  return <div className="account-settings">
    <div className="page-heading">
      <div>
        <span className="page-kicker">ACCOUNT</span>
        <h1>Settings</h1>
        <p>Profile, password, session and account lifecycle controls.</p>
      </div>
    </div>

    {error&&<div className="saas-error">{error}</div>}
    {message&&<div className="saas-success">{message}</div>}

    <div className="account-settings-grid">
      <section className="panel">
        <div className="panel-head"><div><h2>Profile</h2><p>Your personal MetrixIQ account details.</p></div></div>
        <div className="account-settings-form">
          <label><span>Email</span><input value={email} disabled/></label>
          <label><span>Full name</span><input value={name} onChange={(e)=>setName(e.target.value)}/></label>
          <button className="btn primary" disabled={busy==="profile"} onClick={saveProfile}>{busy==="profile"?"Saving…":"Save profile"}</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Security</h2><p>Change the password used for email sign-in.</p></div></div>
        <div className="account-settings-form">
          <label><span>New password</span><input type="password" autoComplete="new-password" value={password} onChange={(e)=>setPassword(e.target.value)}/></label>
          <label><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)}/></label>
          <button className="btn primary" disabled={busy==="password"} onClick={changePassword}>{busy==="password"?"Updating…":"Update password"}</button>
        </div>
      </section>
    </div>

    <section className="panel account-session-panel">
      <div><h2>Current session</h2><p>Sign out of this browser and return to the MetrixIQ login screen.</p></div>
      <button className="btn ghost" disabled={busy==="logout"} onClick={signOut}>{busy==="logout"?"Signing out…":"Log out"}</button>
    </section>

    <section className="panel account-danger-zone">
      <div className="panel-head"><div><span className="page-kicker danger">DANGER ZONE</span><h2>Delete account</h2><p>Permanently removes your MetrixIQ login. Owned workspaces can only be removed when they have no other members and no active subscription.</p></div></div>
      {platformAdmin&&<div className="account-protection-note">Platform Admin protection applies. The final Platform Admin account cannot be deleted.</div>}
      <div className="account-delete-row">
        <label><span>Type <b>DELETE</b> to confirm</span><input value={deleteText} onChange={(e)=>setDeleteText(e.target.value)} placeholder="DELETE"/></label>
        <button className="account-delete-button" disabled={deleteText!=="DELETE"||busy==="delete"} onClick={deleteAccount}>{busy==="delete"?"Deleting…":"Delete my account"}</button>
      </div>
    </section>
  </div>;
}
