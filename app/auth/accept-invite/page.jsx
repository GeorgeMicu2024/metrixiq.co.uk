"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "../../../components/Brand";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [ready,setReady]=useState(false);
  const [name,setName]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [email,setEmail]=useState("");
  const [message,setMessage]=useState("Validating your MetrixIQ invitation…");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const supabase=getSupabaseBrowserClient();
    let active=true;

    async function prepare(){
      try{
        const params=new URLSearchParams(window.location.search);
        const code=params.get("code");

        let sessionResult=await supabase.auth.getSession();
        if(!sessionResult.data?.session&&code){
          const exchanged=await supabase.auth.exchangeCodeForSession(code);
          if(exchanged.error)throw exchanged.error;
          sessionResult=await supabase.auth.getSession();
        }

        if(!active)return;
        const session=sessionResult.data?.session;
        if(session){
          setEmail(session.user?.email||"");
          setName(session.user?.user_metadata?.full_name||session.user?.user_metadata?.name||"");
          await supabase.rpc("redeem_my_pending_invites");
          setReady(true);
          setMessage("");
          return;
        }

        setMessage("Open the invitation link from your email to continue.");
      }catch(e){
        if(!active)return;
        setError(e?.message||"Could not validate the invitation.");
        setMessage("");
      }
    }

    prepare();
    const {data:listener}=supabase.auth.onAuthStateChange(async(event,session)=>{
      if(!active||!session)return;
      if(["SIGNED_IN","INITIAL_SESSION","USER_UPDATED"].includes(event)){
        setEmail(session.user?.email||"");
        setName(session.user?.user_metadata?.full_name||session.user?.user_metadata?.name||"");
        await supabase.rpc("redeem_my_pending_invites");
        setReady(true);
        setMessage("");
        setError("");
      }
    });

    return()=>{active=false;listener.subscription.unsubscribe();};
  },[]);

  async function submit(event){
    event.preventDefault();
    setError("");
    if(!name.trim())return setError("Enter your full name.");
    if(password.length<8)return setError("Password must contain at least 8 characters.");
    if(password!==confirm)return setError("Passwords do not match.");

    setBusy(true);
    try{
      const supabase=getSupabaseBrowserClient();
      const {error:updateError}=await supabase.auth.updateUser({
        password,
        data:{full_name:name.trim()},
      });
      if(updateError)throw updateError;

      const {error:redeemError}=await supabase.rpc("redeem_my_pending_invites");
      if(redeemError)throw redeemError;

      setMessage("Invitation accepted. Opening your MetrixIQ workspace…");
      window.setTimeout(()=>router.replace("/app"),450);
    }catch(e){
      setError(e?.message||"Could not complete the invitation.");
    }finally{
      setBusy(false);
    }
  }

  return <main className="auth-page reset-auth-page">
    <section className="auth-visual">
      <div className="auth-grid"/>
      <Link href="/" className="auth-brand"><Brand inverse/></Link>
      <div className="auth-copy">
        <span className="section-kicker light">TEAM INVITATION</span>
        <h1>Join your MetrixIQ workspace.</h1>
        <p>Your role and site access are assigned from the secure invitation created by your workspace manager.</p>
      </div>
      <p className="auth-foot">MetrixIQ · Secure fleet intelligence</p>
    </section>

    <section className="auth-form-wrap">
      <div className="auth-form">
        <Link href="/" className="mobile-brand"><Brand/></Link>
        <span className="section-kicker">ACCEPT INVITATION</span>
        <h2>Finish your account</h2>
        <p className="auth-sub">{email?<>Invitation for <b>{email}</b>.</>:"Use the secure invitation link from your email."}</p>

        {message&&<div className="form-notice">{message}</div>}
        {error&&<div className="form-error">{error}</div>}

        {ready?<form onSubmit={submit}>
          <label>Full name<input autoComplete="name" value={name} onChange={(e)=>setName(e.target.value)}/></label>
          <label>Choose password<input type="password" autoComplete="new-password" value={password} onChange={(e)=>setPassword(e.target.value)}/></label>
          <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={(e)=>setConfirm(e.target.value)}/></label>
          <button className="submit-btn" disabled={busy}>{busy?"Joining…":"Join workspace"}<span>→</span></button>
        </form>:<p className="auth-switch">No active invitation session? <Link href="/login?mode=register&invite=1">Register with the invited email</Link></p>}
      </div>
    </section>
  </main>;
}
