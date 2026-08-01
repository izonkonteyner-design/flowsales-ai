# AI Feedback, Prompt Versioning and Evaluations

## Traceability

Every completed AI run stores:

- provider
- model
- prompt version
- output schema version
- capability
- policy decision
- token usage and estimated cost

The current prompt registry is defined in `server/services/ai-sales-agent/prompts.ts`. Prompt changes must update `AI_PROMPT_VERSION`; output contract changes must update `AI_OUTPUT_SCHEMA_VERSION` and include a migration or backward-compatibility plan.

## User feedback

Authenticated members can rate completed workspace-scoped runs from `/ai-history` as helpful or not helpful, select a structured reason and add an optional note. One feedback record is stored per user and run. Users may update their own rating. Demo workspaces remain read-only.

Feedback must never be treated as a direct instruction to modify prompts automatically. Product or model changes require reviewed evidence across multiple runs and capabilities.

## Regression evaluation

Run:

```bash
npm run eval:ai
```

The runner loads `evals/ai-regression-cases.json`, validates the output schema, applies the same execution policy used by production and checks expected decisions, approval requirements and evidence types. It writes `artifacts/ai-evaluation-report.json` and exits non-zero when any case fails.

CI runs this suite after unit tests and retains the report artifact for 30 days. The baseline suite includes:

- safe informational lead scoring
- quote recommendations requiring approval
- demo workspace mutation blocking
- malformed output rejection

## Evaluation evidence persistence

`ai_evaluation_runs` is available for durable release evidence. Writes are service-role only. A future release workflow may persist the CI report with its commit SHA after production credentials and an explicit deployment approval process are configured.

## Production activation

Apply migration `0024_ai_feedback_prompt_evaluations.sql`, run the deployment readiness probe and confirm latest migration `0024`. Verify that a completed non-demo AI run displays prompt/model versions, accepts feedback, and that cross-workspace feedback writes are rejected.
