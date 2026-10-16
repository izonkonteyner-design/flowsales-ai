export interface Notification {
  id: string;
  type: "overdue_followup" | "task_due" | "quote_expiring" | "approval_waiting" | "stale_lead" | "ai_action_approval";
  title: string;
  message: string;
  entity_type: "lead" | "quote" | "task" | "customer";
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
  has_more: boolean;
}

export const NOTIFICATION_TYPE_LABELS: Record<Notification["type"], string> = {
  overdue_followup: "Overdue Follow-up",
  task_due: "Task Due",
  quote_expiring: "Quote Expiring",
  approval_waiting: "Approval Waiting",
  stale_lead: "Stale Lead",
  ai_action_approval: "AI Action Approval",
};

export const NOTIFICATION_TYPE_ICONS: Record<Notification["type"], string> = {
  overdue_followup: "AlertTriangle",
  task_due: "Clock",
  quote_expiring: "AlertCircle",
  approval_waiting: "UserCheck",
  stale_lead: "Zap",
  ai_action_approval: "Bot",
};