import ModulePage from "@/components/ModulePage";

export default function IntegrationsPage() {
  return (
    <ModulePage
      title="Integrations"
      phase={7}
      description="CRM, ecommerce and MCP providers behind stable adapters. Credentials are stored encrypted and never exposed to the browser."
      items={["CRM adapter (findCustomer, createCustomer, ...)", "Ecommerce adapter (searchProducts, getOrder, ...)", "MCP tool bridge"]}
    />
  );
}
