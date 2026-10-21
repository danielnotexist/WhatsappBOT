/** Client-safe numbers of the sign-in code (the server policy lives in lib/auth/otp.ts and must agree — tested). */
export const CODE_LENGTH = 6;
export const RESEND_SECONDS = 60;
export const CODE_TTL_MINUTES = 10;
