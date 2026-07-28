"use client";

import { useState } from "react";

// Company logo via Clearbit's free logo endpoint, with a clean letter fallback.
export function Logo({ website, name, size = 34 }: { website: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const domain = website.replace(/^https?:\/\//, "").replace(/\/.*/, "");

  if (err || !domain) {
    return (
      <div className="logo-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>
        {(name[0] || "?").toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      width={size}
      height={size}
      className="logo-img"
      onError={() => setErr(true)}
    />
  );
}
