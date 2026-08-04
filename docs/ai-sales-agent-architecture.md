# AI Sales Agent Architecture

## Objective

FlowSales AI uses a provider-independent sales-agent domain layer. Model output is never executed directly. Every response must be parsed as structured data, evaluated by policy, and tied to workspace-scoped source records.

## Request flow

1. Resolve the authenticated user and active workspace.
2. Build an AI context only from records accessible inside that workspace.
3. Remove secrets and unnecessary personal data.
4. Invoke the configured AI provider with a capability-specific prompt and schema.
5. Parse the response with `aiSalesAgentOutputSchema`.
6. Evaluate the result with `evaluateAiExecutionPolicy`.
7. Return informational output, create an approval request, or block the action.
8. Persist audit metadata without storing provider secrets or unrestricted prompts.

## Safety invariants

- Workspace isolation is mandatory at every data access boundary.
- Demo workspaces remain read-only.
- AI output cannot directly send messages, create quotes, or update CRM records.
- Mutating actions require human approval.
- Quote recommendations require human approval even when no mutation is requested.
- Monetary values must reference trusted catalog, quote, or workspace-rule records.
- Missing or invalid structured output fails closed.
- Provider output is treated as untrusted input.

## Capabilities

The first foundation supports contracts for:

- Lead scoring
- Next best action
- Opportunity summary
- Follow-up draft
- Product recommendation
- Quote recommendation

## Planned modules

- `context-builder.ts`: workspace-scoped and size-bounded context assembly.
- `provider.ts`: provider-neutral interface and Gemini adapter.
- `prompts.ts`: capability-specific system instructions.
- `service.ts`: orchestration, parsing, policy evaluation, and audit writes.
- Approval persistence and UI will be implemented in the Approval System phase.

## Failure behavior

Schema validation, missing evidence, unsafe monetary claims, provider errors, or workspace authorization failures must not produce an executable action. The user receives a safe error or informational fallback, while diagnostic details are logged through the existing structured logger with redaction.
