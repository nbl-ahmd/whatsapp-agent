import ModulePage from "@/components/ModulePage";

export default function AIAgentsPage() {
  return (
    <ModulePage
      title="AI Agents"
      phase={5}
      description="Configure provider-neutral, tool-using agents. The model never has unrestricted database or API access - every action runs through a validated tool."
      items={["Agent configuration and system prompt", "Enabled tools and permissions", "Model/provider selection"]}
    />
  );
}
