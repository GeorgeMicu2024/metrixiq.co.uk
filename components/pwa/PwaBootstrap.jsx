"use client";

import { useEffect } from "react";

export default function PwaBootstrap(){
  useEffect(()=>{
    if(typeof window==="undefined")return;

    function captureInstall(event){
      event.preventDefault();
      window.__metrixiqInstallPrompt=event;
      window.dispatchEvent(new CustomEvent("metrixiq:pwa-install-available"));
    }

    function installed(){
      window.__metrixiqInstallPrompt=null;
      window.dispatchEvent(new CustomEvent("metrixiq:pwa-installed"));
    }

    window.addEventListener("beforeinstallprompt",captureInstall);
    window.addEventListener("appinstalled",installed);

    let cancelled=false;
    let idleId=null;
    let timerId=null;

    function registerServiceWorker(){
      if(cancelled||!("serviceWorker" in navigator))return;
      navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>{});
    }

    function deferServiceWorker(){
      if("requestIdleCallback" in window){
        idleId=window.requestIdleCallback(registerServiceWorker,{timeout:2500});
      }else{
        timerId=window.setTimeout(registerServiceWorker,1800);
      }
    }

    if(document.readyState==="complete"){
      deferServiceWorker();
    }else{
      window.addEventListener("load",deferServiceWorker,{once:true});
    }

    const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true;
    document.documentElement.dataset.pwa=standalone?"standalone":"browser";

    return()=>{
      cancelled=true;
      window.removeEventListener("beforeinstallprompt",captureInstall);
      window.removeEventListener("appinstalled",installed);
      window.removeEventListener("load",deferServiceWorker);
      if(idleId!==null&&"cancelIdleCallback" in window)window.cancelIdleCallback(idleId);
      if(timerId!==null)window.clearTimeout(timerId);
    };
  },[]);

  return null;
}
