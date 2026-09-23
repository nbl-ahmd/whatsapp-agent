import ModulePage from "@/components/ModulePage";

export default function WhatsAppPage() {
  return (
    <ModulePage
      title="WhatsApp"
      phase={2}
      description="Connect Meta WhatsApp Cloud API phone numbers, inspect webhook health and manage message templates. Meta access tokens stay server-side."
      items={["Phone number and account setup", "Webhook verification status", "Template management"]}
    />
  );
}
