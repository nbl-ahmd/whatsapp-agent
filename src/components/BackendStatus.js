"use client";

import { useEffect, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";

export default function BackendStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;
    apiFetch("/health")
      .then(() => active && setStatus("ok"))
      .catch(() => active && setStatus("unreachable"));
    return () => {
      active = false;
    };
  }, []);

  const label =
    status === "ok" ? "connected" : status === "unreachable" ? "unreachable" : "checking...";
  const color =
    status === "ok" ? "text-green-600" : status === "unreachable" ? "text-red-600" : "text-zinc-500";

  return (
    <li className="flex items-center justify-between px-4 py-2 text-sm">
      <span>
        Backend API <span className="font-mono text-xs text-zinc-500">{API_URL}</span>
      </span>
      <span className={color}>{label}</span>
    </li>
  );
}
