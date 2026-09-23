import ModulePage from "@/components/ModulePage";

export default function SettingsPage() {
  return (
    <ModulePage
      title="Settings"
      phase={1}
      description="Organization, users and tenant-level configuration. Tenant identity is derived from the authenticated session, never from client input."
      items={["Organization profile", "Team members and roles", "API keys and webhook secrets"]}
    />
  );
}
