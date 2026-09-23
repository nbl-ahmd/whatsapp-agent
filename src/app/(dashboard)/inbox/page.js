import ModulePage from "@/components/ModulePage";

export default function InboxPage() {
  return (
    <ModulePage
      title="Inbox"
      phase={3}
      description="Unified human inbox for conversations across WhatsApp phone numbers. Agents reply from here, which switches the conversation to human mode and pauses AI."
      items={[
        "Conversation list with mode and unread state",
        "Message thread with outbound send",
        "Take over / return to AI controls",
      ]}
    />
  );
}
