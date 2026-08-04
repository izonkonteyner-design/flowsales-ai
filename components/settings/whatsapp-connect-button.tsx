"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Unplug, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        callback: (response: any) => void,
        options?: {
          config_id?: string;
          response_type?: string;
          override_default_response_type?: boolean;
          extras?: any;
          scope?: string;
        }
      ) => void;
    };
  }
}

export type WhatsAppConnectButtonProps = {
  appId: string;
  configId: string;
  canManage: boolean;
  isDemo: boolean;
  isConfigured: boolean;
  isConnected: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  hasConnection: boolean;
  onStatusChange?: () => void;
};

export function WhatsAppConnectButton({
  appId,
  configId,
  canManage,
  isDemo,
  isConfigured,
  isConnected,
  isExpired,
  isRevoked,
  hasConnection,
  onStatusChange,
}: WhatsAppConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isManageable = canManage && !isDemo && isConfigured;

  const loadMetaSdk = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.FB) {
        resolve();
        return;
      }

      window.fbAsyncInit = function () {
        if (window.FB && appId) {
          window.FB.init({
            appId: appId,
            cookie: true,
            xfbml: true,
            version: 'v21.0',
          });
        }
        resolve();
      };

      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Failed to load Meta JavaScript SDK'));
      document.body.appendChild(script);
    });
  };

  const handleConnect = async () => {
    if (!isManageable) return;

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage("Initializing Meta Embedded Signup...");

    try {
      await loadMetaSdk();

      if (!window.FB) {
        throw new Error("Meta SDK could not be initialized.");
      }

      setStatusMessage("Opening WhatsApp Embedded Signup...");

      window.FB.login(
        async (response: any) => {
          if (!response || !response.authResponse) {
            setLoading(false);
            setStatusMessage(null);
            setErrorMessage("WhatsApp setup was cancelled or closed.");
            return;
          }

          const code = response.authResponse.code;
          if (!code) {
            setLoading(false);
            setStatusMessage(null);
            setErrorMessage("Authorization code was not returned by Meta.");
            return;
          }

          setStatusMessage("Connecting WhatsApp Business Account...");

          try {
            const res = await fetch("/api/integrations/whatsapp/embedded-signup", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                code,
                wabaId: response.authResponse.waba_id,
                phoneNumberId: response.authResponse.phone_number_id,
              }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
              setErrorMessage(data.message || data.error || "Failed to complete WhatsApp connection.");
              setLoading(false);
              setStatusMessage(null);
              return;
            }

            setStatusMessage("WhatsApp Business connected successfully!");
            setLoading(false);
            if (onStatusChange) onStatusChange();
            window.location.reload();
          } catch (err: any) {
            setErrorMessage(err.message || "Network error while completing WhatsApp connection.");
            setLoading(false);
            setStatusMessage(null);
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
          },
        }
      );
    } catch (err: any) {
      setLoading(false);
      setStatusMessage(null);
      setErrorMessage(err.message || "Failed to launch Meta Embedded Signup.");
    }
  };

  const handleDisconnect = async () => {
    if (!isManageable) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage("Disconnecting WhatsApp...");

    try {
      const res = await fetch("/api/integrations/whatsapp/disconnect", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.message || "Failed to disconnect WhatsApp.");
        setLoading(false);
        setStatusMessage(null);
        return;
      }
      setStatusMessage("Disconnected.");
      setLoading(false);
      if (onStatusChange) onStatusChange();
      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err.message || "Network error while disconnecting.");
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const handleHealthCheck = async () => {
    if (!canManage || isDemo) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage("Checking connection health...");

    try {
      const res = await fetch("/api/integrations/whatsapp/health", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.message || "Health check failed.");
        setLoading(false);
        setStatusMessage(null);
        return;
      }

      setStatusMessage(`Status: ${data.status.toUpperCase()}`);
      setLoading(false);
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      setErrorMessage(err.message || "Network error during health check.");
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const disabledReason = isDemo
    ? "Demo mode — Connect to a live workspace to manage integrations"
    : !canManage
    ? "Owner or Admin role required to manage integrations"
    : !isConfigured
    ? "Meta Embedded Signup credentials not configured"
    : null;

  return (
    <div className="flex flex-col gap-2 w-full">
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 w-full">
        {!isConnected && !isRevoked && (
          <button
            type="button"
            id="connect-whatsapp"
            onClick={handleConnect}
            disabled={!isManageable || loading}
            title={disabledReason || "Connect WhatsApp Business via Meta Embedded Signup"}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all min-w-[140px]",
              isManageable && !loading
                ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 shadow-sm"
                : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-600"
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {!isConfigured ? "Configuration required" : "Connect WhatsApp"}
          </button>
        )}

        {(isConnected || isExpired || isRevoked) && (
          <button
            type="button"
            id="reconnect-whatsapp"
            onClick={handleConnect}
            disabled={!isManageable || loading}
            title={disabledReason || "Reconnect WhatsApp Business Account"}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all",
              isManageable && !loading
                ? "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                : "cursor-not-allowed border border-slate-100 text-slate-400 dark:border-white/5 dark:text-slate-600"
            )}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {isExpired ? "Renew" : "Reconnect"}
          </button>
        )}

        {isConnected && (
          <>
            <button
              type="button"
              id="health-whatsapp"
              onClick={handleHealthCheck}
              disabled={!canManage || isDemo || loading}
              title="Verify WhatsApp API connection health"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Check health
            </button>

            <button
              type="button"
              id="disconnect-whatsapp"
              onClick={handleDisconnect}
              disabled={!isManageable || loading}
              title={disabledReason || "Disconnect WhatsApp Business Account"}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ml-auto",
                isManageable && !loading
                  ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                  : "cursor-not-allowed text-slate-400"
              )}
            >
              <Unplug className="h-4 w-4" />
              Disconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}
