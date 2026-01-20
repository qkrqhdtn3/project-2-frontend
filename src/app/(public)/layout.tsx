"use client";

import { useEffect, useState } from "react";
import type { MemberMe } from "@/components/auth/AuthContext";
import PublicShell from "@/components/layout/PublicShell";
import { fetchMe } from "@/lib/auth";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, setMe] = useState<MemberMe | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const check = async () => {
      setIsCheckingAuth(true);
      const result = await fetchMe();
      if (!isMounted) return;
      setMe(result.ok ? result.me : null);
      setIsCheckingAuth(false);
    };
    check();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PublicShell me={me} isCheckingAuth={isCheckingAuth}>
      {children}
    </PublicShell>
  );
}
