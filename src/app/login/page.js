"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, ShieldCheck, Workflow, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { ACUITY_LIST } from "@/lib/acuity";
import { PriorityBadge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The way in. A brand panel states the promise; the card takes the credentials.
 */

const PROMISES = [
  { icon: Sparkles, title: "AI first", body: "Answers inbound messages and acts through tools." },
  { icon: Workflow, title: "Automations", body: "Event-driven rules fire before the AI replies." },
  { icon: ShieldCheck, title: "Human takeover", body: "Any conversation can move to a person." },
];

export default function LoginPage() {
  const router = useRouter();
  const { status, signIn, register } = useAuth();
  const [mode, setMode] = useState("signin");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    organizationName: "",
  });

  useEffect(() => {
    if (status === "signed-in") router.replace("/dashboard");
  }, [status, router]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      if (mode === "register") {
        await register({
          organizationName: form.organizationName,
          name: form.name,
          email: form.email,
          password: form.password,
        });
      } else {
        await signIn(form.email, form.password);
      }
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught?.message || "That did not work. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(79,70,229,0.55),transparent_55%),radial-gradient(120%_120%_at_100%_100%,rgba(139,92,246,0.45),transparent_55%)]"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-white/10 backdrop-blur">
            <MessageCircle className="size-4.5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">WhatsApp Agent</p>
            <p className="text-xs text-white/60">Operator desk</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold tracking-tight">
            The queue, sorted by who needs a person.
          </h2>
          <p className="mt-3 text-sm text-white/70">
            Every conversation carries a priority. The badge is the promise: how long that
            customer has been waiting, and whether anyone has answered.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {ACUITY_LIST.map((meta) => (
              <PriorityBadge key={meta.level} level={meta.level} />
            ))}
          </div>

          <div className="mt-8 space-y-3">
            {PROMISES.map((item) => (
              <div key={item.title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                  <item.icon className="size-4" />
                </span>
                <p className="text-sm text-white/70">
                  <span className="font-medium text-white">{item.title}</span> — {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/50">
          Meta tokens stay on the server · one organization per desk · open source
        </p>
      </section>

      <section className="grid place-items-center bg-background p-6">
        <Card className="w-full max-w-sm gap-6 py-6">
          <CardContent className="space-y-5">
            <div className="flex items-center gap-2.5 lg:hidden">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <MessageCircle className="size-4" />
              </span>
              <span className="text-sm font-semibold">WhatsApp Agent</span>
            </div>

            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Create your desk"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to your organization's desk."
                  : "You become the owner. Connect a WhatsApp number afterwards."}
              </p>
            </div>

            <Tabs value={mode} onValueChange={setMode}>
              <TabsList className="w-full">
                <TabsTrigger value="signin" className="flex-1">
                  Sign in
                </TabsTrigger>
                <TabsTrigger value="register" className="flex-1">
                  Create account
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={submit} className="space-y-4">
              {mode === "register" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="organizationName">Organization</Label>
                    <Input
                      id="organizationName"
                      value={form.organizationName}
                      onChange={update("organizationName")}
                      placeholder="Acme Retail"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Your name</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={update("name")}
                      placeholder="Ada Owner"
                      required
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={update("email")}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={update("password")}
                  placeholder="••••••••"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                />
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === "signin" ? "Sign in" : "Create organization"}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              Sessions are scoped to one organization. Every query is tenant-isolated.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
