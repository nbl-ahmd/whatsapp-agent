import ModulePage from "@/components/ModulePage";

export default function ContactsPage() {
  return (
    <ModulePage
      title="Contacts"
      phase={3}
      description="Organization-scoped contact records and tags. Tags feed automation conditions and AI tools."
      items={["Contact list and detail", "Tags and custom attributes", "Conversation history per contact"]}
    />
  );
}
