/** Client-side helpers for rendering Meta template/Flow metadata. */

export function templateStatusTone(status) {
  switch (String(status ?? "").toUpperCase()) {
    case "APPROVED":
      return "green";
    case "PENDING":
    case "IN_APPEAL":
      return "amber";
    case "REJECTED":
    case "DISABLED":
      return "red";
    case "PAUSED":
      return "violet";
    default:
      return "zinc";
  }
}

export function flowStatusTone(status) {
  switch (String(status ?? "").toUpperCase()) {
    case "PUBLISHED":
      return "green";
    case "DRAFT":
      return "amber";
    case "DEPRECATED":
    case "BLOCKED":
      return "red";
    case "THROTTLED":
      return "violet";
    default:
      return "zinc";
  }
}

export function findComponent(template, type) {
  return (template?.components ?? []).find(
    (component) => String(component.type ?? "").toUpperCase() === String(type).toUpperCase(),
  );
}

export function templateBodyText(template) {
  return findComponent(template, "BODY")?.text ?? "";
}

export function templateButtons(template) {
  return findComponent(template, "BUTTONS")?.buttons ?? [];
}

export function templateHasFlowButton(template) {
  return templateButtons(template).some(
    (button) => String(button.type ?? "").toUpperCase() === "FLOW",
  );
}

export function templateFlowButton(template) {
  return (
    templateButtons(template).find(
      (button) => String(button.type ?? "").toUpperCase() === "FLOW",
    ) ?? null
  );
}

export function templateFlowButtonIndex(template) {
  return templateButtons(template).findIndex(
    (button) => String(button.type ?? "").toUpperCase() === "FLOW",
  );
}
