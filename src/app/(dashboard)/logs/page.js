import ModulePage from "@/components/ModulePage";

export default function LogsPage() {
  return (
    <ModulePage
      title="Logs"
      phase={9}
      description="Webhook events, automation runs and audit logs with secrets redacted."
      items={["Raw webhook event inspection", "Automation run traces", "Audit log"]}
    />
  );
}
