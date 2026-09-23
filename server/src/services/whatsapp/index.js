/**
 * WhatsApp integration layer.
 *
 * All Meta WhatsApp Cloud API specifics (Graph API version, endpoints, payload
 * shapes) are isolated in `meta-client.js`. Everything else talks to the
 * provider-neutral outbound interface in `service.js`.
 *
 * Never import this module from client components.
 */
export * as metaClient from "./meta-client.js";
export * from "./service.js";
export {
  resolveAccessToken,
  resolvePhoneNumberContext,
} from "./credentials.js";

export const descriptor = Object.freeze({
  name: "whatsapp",
  phase: 2,
  description: "Meta WhatsApp Cloud API integration and outbound messaging abstraction.",
});
