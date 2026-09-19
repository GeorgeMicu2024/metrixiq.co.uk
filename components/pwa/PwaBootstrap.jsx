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

    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>{});
    }

    const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true;
    document.documentElement.dataset.pwa=standalone?"standalone":"browser";

    return()=>{
      window.removeEventListener("beforeinstallprompt",captureInstall);
      window.removeEventListener("appinstalled",installed);
    };
  },[]);

  return null;
}
