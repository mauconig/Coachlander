/** Runtime endpoints can be overridden for local development or staging. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://coachlander.147-93-180-120.sslip.io';

export const EPHEMERAL_TEST_EMAIL =
  process.env.EXPO_PUBLIC_EPHEMERAL_TEST_EMAIL?.trim().toLowerCase() ?? '';
