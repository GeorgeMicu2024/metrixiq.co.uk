"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "./Brand";

const SESSION="metrixiq.session", USERS="metrixiq.users";
export default function LoginClient(){
  const router=useRouter();
  const [register,setRegister]=useState(false); const [name,setName]=useState("George Micu"); const [org,setOrg]=useState("Danube Courier Services"); const [email,setEmail]=useState("george@metrixiq.co.uk"); const [password,setPassword]=useState("demo1234"); const [error,setError]=useState("");
  useEffect(()=>{ try { setRegister(new URLSearchParams(window.location.search).get("mode") === "register"); } catch {} },[]);
  function submit(e){
    e.preventDefault(); setError(""); const clean=email.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(clean)) return setError("Enter a valid email address.");
    if(password.length<6) return setError("Password must contain at least 6 characters.");
    let users={}; try{users=JSON.parse(localStorage.getItem(USERS)||"{}");}catch{}
    if(register){ const user={name:name.trim()||clean.split("@")[0],email:clean,organisation:org.trim()||"My Fleet"}; users[clean]={password,user}; localStorage.setItem(USERS,JSON.stringify(users)); localStorage.setItem(SESSION,JSON.stringify(user)); router.push("/app"); return; }
    const stored=users[clean]; if(stored){ if(stored.password!==password) return setError("Incorrect password."); localStorage.setItem(SESSION,JSON.stringify(stored.user)); router.push("/app"); return; }
    if(clean==="george@metrixiq.co.uk"&&password==="demo1234"){localStorage.setItem(SESSION,JSON.stringify({name:"George Micu",email:clean,organisation:"Danube Courier Services"})); router.push("/app"); return;}
    setError("Account not found. Create a workspace or use the demo account.");
  }
  return <main className="auth-page"><section className="auth-visual"><div className="auth-grid"/><Link href="/" className="auth-brand"><Brand inverse/></Link><div className="auth-copy"><span className="section-kicker light">OPERATIONAL INTELLIGENCE</span><h1>One workspace for every fleet performance decision.</h1><p>Import operational reports, map TRIDs to drivers, identify risk and turn weekly scorecards into a clear management workflow.</p><ul><li><span>✓</span> Multiple Excel / CSV / PDF imports</li><li><span>✓</span> DCR · POD · FICO · IADC · Concessions</li><li><span>✓</span> Driver risk and coaching intelligence</li></ul></div><p className="auth-foot">MetrixIQ · Fleet & driver intelligence</p></section>
    <section className="auth-form-wrap"><div className="auth-form"><Link href="/" className="mobile-brand"><Brand/></Link><span className="section-kicker">{register?"CREATE WORKSPACE":"WELCOME BACK"}</span><h2>{register?"Start your MetrixIQ workspace":"Sign in to MetrixIQ"}</h2><p className="auth-sub">{register?"14-day Business trial. No card required.":"Use your account or the included demo workspace."}</p>
      <div className="provider-row"><button type="button" onClick={()=>{localStorage.setItem(SESSION,JSON.stringify({name:"Google Demo User",email:"google@metrixiq.local",organisation:"Demo Fleet"}));router.push("/app")}}>Continue with Google</button><button type="button" onClick={()=>{localStorage.setItem(SESSION,JSON.stringify({name:"Apple Demo User",email:"apple@metrixiq.local",organisation:"Demo Fleet"}));router.push("/app")}}>Continue with Apple</button></div>
      <div className="divider"><span/>or email<span/></div>
      <form onSubmit={submit}>{register&&<><label>Full name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Organisation<input value={org} onChange={e=>setOrg(e.target.value)}/></label></>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="form-error">{error}</div>}<button className="submit-btn">{register?"Create workspace":"Sign in"}<span>→</span></button></form>
      {!register&&<div className="demo-box"><b>Demo login</b><span>Email: george@metrixiq.co.uk</span><span>Password: demo1234</span></div>}
      <p className="auth-switch">{register?"Already have an account?":"New to MetrixIQ?"} <button onClick={()=>{setRegister(!register);setError("")}}>{register?"Sign in":"Create workspace"}</button></p>
    </div></section></main>;
}
