import { logger } from "../../lib/logger.js";
import { prisma } from "../../db/prisma.js";
import { getConversation } from "../conversations/service.js";
import { executeAction, organizationName } from "./actions.js";
import { evaluateConditions } from "./conditions.js";
import { validateWorkflow } from "./schema.js";

/**
 * Automation engine.
 *
 * The engine only ever sees normalized internal events (never Meta payloads),
 * and each run is persisted with the condition results and action results so an
 * operator can explain afterwards why something did or did not happen.
 */

async function buildContext({ organizationId, event }) {
  const [conversation, contact, orgName] = await Promise.all([
    event.conversationId
      ? getConversation({ organizationId, conversationId: event.conversationId })
      : null,
    event.contactId
      ? prisma.contact.findFirst({ where: { id: event.contactId, organizationId } })
      : null,
    organizationName(organizationId),
  ]);

  return { organizationId, event, conversation, contact, organizationName: orgName, handoff: false };
}

/**
 * Run every active workflow that listens for this event type.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {{ type: string, text?: string, conversationId?: string|null, contactId?: string|null, messageId?: string|null, variables?: object, tags?: string[], intent?: string|null }} params.event
 */
export async function runAutomationsForEvent({ organizationId, event }) {
  const automations = await prisma.automation.findMany({
    where: { organizationId, trigger: event.type, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (automations.length === 0) return { ran: 0, handoff: false, messaged: false, runs: [] };

  const context = await buildContext({ organizationId, event });
  const runs = [];
  const messagingActions = ["send_message", "send_template", "ai_agent"];

  for (const automation of automations) {
    const run = await prisma.automationRun.create({
      data: {
        organizationId,
        automationId: automation.id,
        conversationId: event.conversationId ?? null,
        contactId: event.contactId ?? null,
        eventType: event.type,
        status: "running",
        triggerPayload: event,
        startedAt: new Date(),
      },
    });

    const conditions = Array.isArray(automation.conditions) ? automation.conditions : [];
    const evaluation = evaluateConditions(conditions, {
      text: event.text,
      variables: context.conversation?.variables ?? {},
      tags: context.contact?.tags ?? [],
      intent: event.intent ?? null,
    });

    if (!evaluation.passed) {
      const skipped = await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: "skipped",
          result: { conditions: evaluation.results },
          finishedAt: new Date(),
        },
      });
      runs.push({ automationId: automation.id, status: skipped.status });
      continue;
    }

    const actionResults = [];
    let failed = false;

    for (const action of Array.isArray(automation.actions) ? automation.actions : []) {
      try {
        const result = await executeAction(action, context);
        actionResults.push(result);
        if (result.ok && messagingActions.includes(action.type)) context.messaged = true;
        if (!result.ok) {
          logger.warn("Automation action did not succeed", {
            automationId: automation.id,
            type: action.type,
            error: result.error,
          });
        }
      } catch (error) {
        failed = true;
        actionResults.push({ type: action.type, ok: false, error: error.message });
        logger.error("Automation action threw", {
          automationId: automation.id,
          type: action.type,
          error: error.message,
        });
        break;
      }
    }

    const finished = await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: failed ? "failed" : "success",
        result: { conditions: evaluation.results, actions: actionResults },
        error: failed ? actionResults.at(-1)?.error ?? "action failed" : null,
        finishedAt: new Date(),
      },
    });

    runs.push({ automationId: automation.id, status: finished.status });
  }

  return { ran: runs.length, handoff: Boolean(context.handoff), messaged: Boolean(context.messaged), runs };
}

/**
 * Manual test run for the Automations page. Uses the same code path as a live
 * event, so what an operator sees here is what production does.
 */
export async function testAutomation({ organizationId, automationId, conversationId = null }) {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, organizationId },
  });
  if (!automation) return null;

  const conversation = conversationId
    ? await getConversation({ organizationId, conversationId })
    : await prisma.conversation.findFirst({
        where: { organizationId },
        orderBy: { lastMessageAt: "desc" },
      });

  const contact = conversation
    ? await prisma.contact.findFirst({ where: { id: conversation.contactId, organizationId } })
    : await prisma.contact.findFirst({ where: { organizationId } });

  if (!conversation || !contact) {
    return { skipped: true, reason: "No conversation or contact available to test with" };
  }

  const run = await prisma.automationRun.create({
    data: {
      organizationId,
      automationId: automation.id,
      conversationId: conversation.id,
      contactId: contact.id,
      eventType: automation.trigger,
      status: "running",
      triggerPayload: { test: true },
      startedAt: new Date(),
    },
  });

  const context = {
    organizationId,
    event: { type: automation.trigger, text: "test run", conversationId: conversation.id, contactId: contact.id },
    conversation,
    contact,
    organizationName: await organizationName(organizationId),
    handoff: false,
  };

  const results = [];
  for (const action of Array.isArray(automation.actions) ? automation.actions : []) {
    try {
      results.push(await executeAction(action, context));
    } catch (error) {
      results.push({ type: action.type, ok: false, error: error.message });
      break;
    }
  }

  const finished = await prisma.automationRun.update({
    where: { id: run.id },
    data: {
      status: results.some((result) => !result.ok) ? "failed" : "success",
      result: { test: true, actions: results },
      finishedAt: new Date(),
    },
  });

  return {
    run: finished,
    conversation: { id: conversation.id, contact: contact.name ?? contact.waId },
    actions: results,
    validated: validateWorkflow({
      trigger: automation.trigger,
      conditions: automation.conditions,
      actions: automation.actions,
    }).trigger,
  };
}
