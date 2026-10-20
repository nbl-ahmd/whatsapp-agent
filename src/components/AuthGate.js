"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

/**
 * Holds the signed-in shell until the session is verified. A missing or expired
 * token lands on the sign-in screen instead of an empty desk.
 */

export default function AuthGate({ children }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-out") router.replace("/login");
  }, [status, router]);

  if (status !== "signed-in") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="flex flex-col items-center gap-4">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <MessageCircle className="size-5" />
          </span>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {status === "loading" ? "Opening the desk…" : "Returning to sign in…"}
          </div>
        </div>
      </div>
    );
  }

  return children;
}
