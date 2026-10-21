/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '@supabase/ssr' {
  export type CookieToSet = {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  };

  export interface CookieMethodsServer {
    getAll(): { name: string; value: string }[] | Promise<{ name: string; value: string }[]>;
    setAll?(cookiesToSet: CookieToSet[]): void | Promise<void>;
  }

  export function createServerClient(
    url: string,
    anonKey: string,
    options: {
      cookies: CookieMethodsServer;
      [key: string]: unknown;
    }
  ): any;

  export function createBrowserClient(
    url: string,
    anonKey: string,
    options?: Record<string, unknown>
  ): any;
}

declare module '@sentry/nextjs' {
  export const init: any;
  export const handlers: any;
  export const captureException: any;
  export const captureMessage: any;
  export const withSentryConfig: any;
}
