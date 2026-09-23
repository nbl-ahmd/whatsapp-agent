import ModulePage from "@/components/ModulePage";

export default function AutomationsPage() {
  return (
    <ModulePage
      title="Automations"
      phase={4}
      description="Event-driven workflows defined as JSON. Triggers include MESSAGE_RECEIVED, FLOW_COMPLETED, CONVERSATION_STARTED, ORDER_CREATED and ORDER_UPDATED."
      items={[
        "Workflow list and JSON editor",
        "Actions: send_message, send_template, ai_agent, handoff_human and more",
        "Run history and debugging",
      ]}
    />
  );
}
