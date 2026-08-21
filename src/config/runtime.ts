/** Runtime endpoints can be overridden for local development or staging. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://coachlander.147-93-180-120.sslip.io';

export const EPHEMERAL_TEST_EMAIL =
  process.env.EXPO_PUBLIC_EPHEMERAL_TEST_EMAIL?.trim().toLowerCase() ?? '';

/** Development-only E2E correlation id. Never contains credentials or user data. */
export const E2E_RUN_ID = process.env.EXPO_PUBLIC_E2E_RUN_ID?.trim() ?? '';
export const E2E_TRACE_ENABLED = process.env.EXPO_PUBLIC_E2E_TRACE === 'true';
