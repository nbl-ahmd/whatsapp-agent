import { ValidationError } from "../../../lib/errors.js";
import { requestJson, requireString } from "./http.js";

/**
 * Shopify ecommerce adapter (Admin API access token).
 *
 * Read paths cover the common support questions (product, order, recent orders).
 * `createOrder` and `cancelOrder` are the only mutating calls; callers must
 * validate intent before invoking them.
 */

const CANCEL_REASONS = new Set(["customer", "fraud", "inventory", "declined", "other"]);

function mapProduct(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return {
    id: product?.id ?? null,
    title: product?.title ?? null,
    status: product?.status ?? null,
    vendor: product?.vendor ?? null,
    productType: product?.product_type ?? null,
    price: variants[0]?.price ?? null,
    variants: variants.slice(0, 20).map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      sku: variant.sku ?? null,
      available: variant.inventory_quantity === undefined ? null : variant.inventory_quantity > 0,
    })),
  };
}

function mapOrder(order) {
  return {
    id: order?.id ?? null,
    name: order?.name ?? null,
    email: order?.email ?? null,
    financialStatus: order?.financial_status ?? null,
    fulfillmentStatus: order?.fulfillment_status ?? null,
    total: order?.total_price ?? null,
    currency: order?.currency ?? null,
    createdAt: order?.created_at ?? null,
    cancelledAt: order?.cancelled_at ?? null,
    lineItems: (Array.isArray(order?.line_items) ? order.line_items : []).slice(0, 50).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku ?? null,
    })),
  };
}

export function createShopifyAdapter({ credentials = {}, config = {} } = {}) {
  const accessToken = credentials.accessToken;
  if (!accessToken) throw new ValidationError("Shopify access token is missing");

  const shopDomain = String(config.shopDomain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (!shopDomain) throw new ValidationError("Shopify shop domain is missing");

  const apiVersion = /^\d{4}-\d{2}$/.test(String(config.apiVersion || ""))
    ? String(config.apiVersion)
    : "2024-10";
  const baseUrl = config.baseUrl
    ? String(config.baseUrl).replace(/\/+$/, "")
    : `https://${shopDomain}/admin/api/${apiVersion}`;
  const headers = { "x-shopify-access-token": accessToken };
  const request = (path, options = {}) => requestJson(`${baseUrl}${path}`, { ...options, headers });

  async function searchProducts({ query = "", limit = 10 } = {}) {
    const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const result = await request("/products.json?limit=250");
    const products = Array.isArray(result?.products) ? result.products : [];
    const needle = String(query).trim().toLowerCase();

    return products
      .filter((product) => {
        if (!needle) return true;
        const haystack = [product.title, product.vendor, product.product_type, ...(product.tags ?? "").split(",")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, take)
      .map(mapProduct);
  }

  async function getProduct({ id } = {}) {
    const productId = requireString(id, "id", { max: 40 });
    const result = await request(`/products/${encodeURIComponent(productId)}.json`);
    return mapProduct(result?.product);
  }

  async function getOrder({ id } = {}) {
    const orderId = requireString(id, "id", { max: 40 });
    const result = await request(`/orders/${encodeURIComponent(orderId)}.json?status=any`);
    return mapOrder(result?.order);
  }

  async function listOrders({ status = "any", limit = 10 } = {}) {
    const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const allowed = new Set(["any", "open", "closed", "cancelled"]);
    const state = allowed.has(status) ? status : "any";
    const result = await request(`/orders.json?status=${state}&limit=${take}`);
    return (Array.isArray(result?.orders) ? result.orders : []).map(mapOrder);
  }

  async function createOrder({ lineItems = [], email, note } = {}) {
    const items = lineItems
      .filter((item) => item && item.variantId)
      .map((item) => ({
        variant_id: Number(item.variantId),
        quantity: Math.min(Math.max(Number(item.quantity) || 1, 1), 100),
      }));

    if (items.length === 0) {
      throw new ValidationError("createOrder requires at least one line item with variantId");
    }

    const result = await request("/orders.json", {
      method: "POST",
      body: {
        order: {
          line_items: items,
          ...(email ? { email: String(email).trim() } : {}),
          ...(note ? { note: String(note).slice(0, 1_000) } : {}),
          financial_status: "pending",
        },
      },
    });

    return mapOrder(result?.order);
  }

  async function cancelOrder({ id, reason = "customer" } = {}) {
    const orderId = requireString(id, "id", { max: 40 });
    const result = await request(`/orders/${encodeURIComponent(orderId)}/cancel.json`, {
      method: "POST",
      body: { reason: CANCEL_REASONS.has(reason) ? reason : "other" },
    });
    return mapOrder(result?.order);
  }

  async function ping() {
    const result = await request("/shop.json");
    return { ok: true, provider: "shopify", shop: result?.shop?.name ?? null };
  }

  return { searchProducts, getProduct, getOrder, listOrders, createOrder, cancelOrder, ping };
}
