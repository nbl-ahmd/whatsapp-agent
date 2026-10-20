import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";

export default function DashboardLayout({ children }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
