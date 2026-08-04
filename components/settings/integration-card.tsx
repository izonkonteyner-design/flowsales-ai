"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Unplug,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelProvider, ConnectionStatus } from "@/server/services/integrations/provider-adapter";

// ============================================================================
// Integration Card Component
//
// Displays a single provider's connection state.
// Role and demo guards are enforced: viewer/demo users see read-only cards.
//
// Security: No token or secret values are ever passed to this component.
// The connection prop contains only display-safe metadata.
// ============================================================================

export type IntegrationCardConnection = {
  id: string;
  provider: ChannelProvider;
  status: ConnectionStatus;
  displayName: string | null;
  externalAccountId: string | null;
  scopes: string[];
  lastSyncedAt: string | null;
  lastConnectedAt: string | null;
  errorMessage: string | null;
};

type ProviderMeta = {
  label: string;
  description: string;
  color: string;
  gradient: string;
  icon: React.ReactNode;
};

const PROVIDER_META: Record<ChannelProvider, ProviderMeta> = {
  whatsapp: {
    label: "WhatsApp Business",
    description: "Send and receive WhatsApp messages, manage contacts, and track conversations from your CRM.",
    color: "text-emerald-600 dark:text-emerald-400",
    gradient: "from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  instagram: {
    label: "Instagram",
    description: "Manage Instagram Direct Messages, comments, and lead generation from Instagram ads.",
    color: "text-pink-600 dark:text-pink-400",
    gradient: "from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  facebook: {
    label: "Facebook",
    description: "Connect Facebook Pages, Messenger, and Facebook Leads Ads to your CRM pipeline.",
    color: "text-blue-600 dark:text-blue-400",
    gradient: "from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  google: {
    label: "Google Business Profile",
    description: "Sync Google Business reviews, messages, and local customer interactions with your CRM.",
    color: "text-red-600 dark:text-red-400",
    gradient: "from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
  },
  tiktok: {
    label: "TikTok",
    description: "Connect TikTok for Business, manage TikTok Lead Generation ads, and DMs from your CRM.",
    color: "text-slate-800 dark:text-slate-200",
    gradient: "from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.22 8.22 0 004.82 1.56V6.79a4.85 4.85 0 01-1.05-.1z" />
      </svg>
    ),
  },
};

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const styles: Record<ConnectionStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    connected: {
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: "Connected",
    },
    connecting: {
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: "Connecting…",
    },
    not_connected: {
      cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
      icon: <WifiOff className="h-3.5 w-3.5" />,
      label: "Not connected",
    },
    expired: {
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
      icon: <Clock className="h-3.5 w-3.5" />,
      label: "Expired",
    },
    error: {
      cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
      icon: <XCircle className="h-3.5 w-3.5" />,
      label: "Error",
    },
    revoked: {
      cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      label: "Disconnected",
    },
  };

  const s = styles[status] ?? styles.not_connected;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", s.cls)}>
      {s.icon}
      {s.label}
    </span>
  );
}

function formatRelativeTime(isoString: string | null): string | null {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return null;
  }
}

// ============================================================================
// Main IntegrationCard
// ============================================================================

export type IntegrationCardProps = {
  provider: ChannelProvider;
  /** null means no DB row exists yet (never connected). */
  connection: IntegrationCardConnection | null;
  /** Whether the current user can manage connections (owner/admin). */
  canManage: boolean;
  /** Whether this is a demo workspace (read-only). */
  isDemo: boolean;
  /** Whether provider credentials are configured server-side. */
  isProviderConfigured: boolean;
};

export function IntegrationCard({
  provider,
  connection,
  canManage,
  isDemo,
  isProviderConfigured,
}: IntegrationCardProps) {
  const meta = PROVIDER_META[provider];
  const status = connection?.status ?? "not_connected";
  const isConnected = status === "connected";
  const isExpired = status === "expired";
  const isError = status === "error";
  const isRevoked = status === "revoked";
  const isManageable = canManage && !isDemo;

  const disabledReason = isDemo
    ? "Demo mode — Connect to a live workspace to manage integrations"
    : !canManage
      ? "Owner or Admin role required to manage integrations"
      : !isProviderConfigured
        ? "Provider credentials not configured"
        : null;

  const showConfigRequired = !isProviderConfigured && !isDemo;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border bg-white shadow-sm transition-all duration-300",
        "border-slate-200/80 hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20",
        isConnected && "ring-1 ring-emerald-200 dark:ring-emerald-800/40",
      )}
    >
      {/* Top gradient strip */}
      <div className={cn("h-1 w-full bg-gradient-to-r", meta.gradient.replace("from-", "from-").split(" ").join(" "))} />

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br p-0.5",
                meta.gradient,
              )}
            >
              <div className={cn("flex h-full w-full items-center justify-center rounded-2xl bg-white dark:bg-slate-900", meta.color)}>
                {meta.icon}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-slate-950 dark:text-white">{meta.label}</h3>
              <StatusBadge status={status} />
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{meta.description}</p>

        {/* Configuration required notice */}
        {showConfigRequired && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200/70 bg-amber-50 px-3 py-2.5 dark:border-amber-800/40 dark:bg-amber-950/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <span className="font-medium">Configuration required.</span> Provider credentials for{" "}
              {meta.label} are not set up. Contact your administrator.
            </p>
          </div>
        )}

        {/* Error message */}
        {isError && connection?.errorMessage && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200/70 bg-red-50 px-3 py-2.5 dark:border-red-800/40 dark:bg-red-950/20">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-xs text-red-700 dark:text-red-400">{connection.errorMessage}</p>
          </div>
        )}

        {/* Connected account info */}
        {isConnected && connection?.displayName && (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/5">
            <Wifi className="h-4 w-4 shrink-0 text-emerald-500" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                {connection.displayName}
              </p>
              {connection.lastSyncedAt && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Last synced {formatRelativeTime(connection.lastSyncedAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Scopes */}
        {isConnected && connection && connection.scopes.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Permissions</p>
            <div className="flex flex-wrap gap-1.5">
              {connection.scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-400"
                >
                  {scope}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Demo / viewer notice */}
        {(isDemo || !canManage) && (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/5">
            <AlertCircle className="h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isDemo ? "Demo mode — read-only" : "Read-only — owner or admin required"}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-6 py-4 dark:border-white/10">
        {/* Connect button */}
        {(!isConnected && !isRevoked) && (
          <a
            href={isManageable && isProviderConfigured ? `/api/integrations/${provider}/connect` : undefined}
            id={`connect-${provider}`}
            aria-label={`Connect ${meta.label}`}
            aria-disabled={!isManageable || !isProviderConfigured}
            tabIndex={!isManageable || !isProviderConfigured ? -1 : undefined}
            title={disabledReason ?? `Connect ${meta.label}`}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all",
              isManageable && isProviderConfigured
                ? "bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-600",
            )}
            onClick={
              !isManageable || !isProviderConfigured
                ? (e) => e.preventDefault()
                : undefined
            }
          >
            <Zap className="h-4 w-4" />
            {showConfigRequired ? "Configuration required" : "Connect"}
          </a>
        )}

        {/* Reconnect button */}
        {(isConnected || isExpired || isRevoked) && (
          <a
            href={isManageable && isProviderConfigured ? `/api/integrations/${provider}/connect` : undefined}
            id={`reconnect-${provider}`}
            aria-label={`Reconnect ${meta.label}`}
            aria-disabled={!isManageable || !isProviderConfigured}
            tabIndex={!isManageable || !isProviderConfigured ? -1 : undefined}
            title={disabledReason ?? `Reconnect ${meta.label}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all",
              isManageable && isProviderConfigured
                ? "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                : "cursor-not-allowed border border-slate-100 text-slate-400 dark:border-white/5 dark:text-slate-600",
            )}
            onClick={
              !isManageable || !isProviderConfigured
                ? (e) => e.preventDefault()
                : undefined
            }
          >
            <RefreshCw className="h-4 w-4" />
            {isExpired ? "Renew" : "Reconnect"}
          </a>
        )}

        {/* Disconnect button */}
        {isConnected && connection && (
          <form
            action={`/api/integrations/${provider}/disconnect`}
            method="POST"
            className="ml-auto"
            onSubmit={!isManageable ? (e) => e.preventDefault() : undefined}
          >
            <input type="hidden" name="connectionId" value={connection.id} />
            <button
              id={`disconnect-${provider}`}
              type="submit"
              disabled={!isManageable}
              aria-label={`Disconnect ${meta.label}`}
              title={disabledReason ?? `Disconnect ${meta.label}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
                isManageable
                  ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                  : "cursor-not-allowed text-slate-400",
              )}
            >
              <Unplug className="h-4 w-4" />
              Disconnect
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
