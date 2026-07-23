export type DemoActionStage =
  | "admin_config"
  | "demo_config"
  | "rate_limit"
  | "rate_limit_bypass"
  | "demo_auth"
  | "join_workspace"
  | "redirect";

export function buildDemoActionStagePayload<T extends Record<string, unknown>>(stage: DemoActionStage, details: T) {
  return {
    stage,
    ...details,
  } as { stage: DemoActionStage } & T;
}

export function emitDemoActionStageLog<T extends Record<string, unknown>>(stage: DemoActionStage, details: T) {
  console.error("[auth] startDemoAction stage", {
    ...buildDemoActionStagePayload(stage, details),
  });
}
