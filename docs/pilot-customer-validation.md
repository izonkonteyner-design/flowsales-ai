# FlowSales AI Pilot Customer Validation

## Objective

Validate that real sales teams can onboard, import data, use AI recommendations safely, and obtain measurable workflow value before paid launch.

## Minimum cohort

- 3 independent companies
- At least 2 active users per company
- 14 consecutive days of use
- At least 25 real leads imported or created per workspace

## Required scenarios

1. Complete owner onboarding.
2. Import leads through CSV and resolve rejected rows.
3. Run Lead Scoring on at least 10 leads.
4. Run Next Best Action on at least 10 leads.
5. Create at least 5 Follow-up Drafts.
6. Review at least 3 Product Recommendations.
7. Review at least 2 Quote Recommendations through Approval Queue.
8. Inspect AI History, usage and notifications.
9. Submit one data export request.

## Success gates

- Onboarding completion rate: at least 80% without developer intervention.
- CSV import success: at least 95% of valid rows accepted.
- AI structured-output success: at least 98% of completed runs.
- Cross-workspace data exposure: zero incidents.
- Unapproved mutating AI actions: zero incidents.
- Median time to first AI result: under 15 minutes after account creation.
- At least 70% of pilot users report that Lead Scoring or Next Best Action saves time.
- At least 2 of 3 companies confirm willingness to continue using the product.

## Evidence to collect

- Workspace and user identifiers
- Onboarding start/completion timestamps
- Import job totals and rejected-row reasons
- AI runs by capability, status, tokens and cost
- Approval decisions and reviewer role
- Support requests and severity
- User feedback score from 1–5
- Verbatim customer feedback with consent

## Stop conditions

Pause the pilot immediately for any workspace-isolation failure, unapproved mutation, billing state corruption, unrecoverable data loss, or repeatable authentication bypass.

## Completion rule

Task 18 is complete only after real pilot evidence satisfies the gates above. Repository documentation and instrumentation alone do not constitute customer validation.
