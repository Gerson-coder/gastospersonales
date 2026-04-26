// TODO: server-side redirect via Supabase session in Batch C; for now this is client-side localStorage gate.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    let target = "/dashboard";
    try {
      if (!window.localStorage.getItem("lumi-user-name")) target = "/login";
    } catch {
      /* ignore */
    }
    router.replace(target);
  }, [router]);
  return null;
}
