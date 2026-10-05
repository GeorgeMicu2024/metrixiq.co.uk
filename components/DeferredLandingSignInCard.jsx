"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

const LandingSignInCard = lazy(() => import("./LandingSignInCard"));

function Placeholder({ anchorRef }) {
  return (
    <div
      ref={anchorRef}
      className="mk-login-card mk-login-card-placeholder"
      aria-hidden="true"
    >
      <div className="mk-login-placeholder-brand">Metrix<span>IQ</span></div>
      <small>WELCOME BACK</small>
      <h3>Sign in to your account</h3>
      <div className="mk-login-placeholder-field" />
      <div className="mk-login-placeholder-field" />
      <div className="mk-login-placeholder-button" />
    </div>
  );
}

export default function DeferredLandingSignInCard() {
  const anchorRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = anchorRef.current;
    if (!node) {
      setReady(true);
      return undefined;
    }

    if (!("IntersectionObserver" in window)) {
      setReady(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "220px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!ready) return <Placeholder anchorRef={anchorRef} />;

  return (
    <Suspense fallback={<Placeholder anchorRef={anchorRef} />}>
      <LandingSignInCard />
    </Suspense>
  );
}
