import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Splits an international number without "+" (WhatsApp's waId, e.g.
 * "911234567890") into the CRM's `phoneCountryCode` ("+91") and `phone`
 * ("1234567890"). Returns null when it can't be parsed.
 */
export const splitInternationalNumber = (
  raw: string,
): { phoneCountryCode: string; phone: string; e164: string } | null => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;

  const parsed = parsePhoneNumberFromString(`+${digits}`);
  if (!parsed?.countryCallingCode || !parsed.nationalNumber) return null;

  return {
    phoneCountryCode: `+${parsed.countryCallingCode}`,
    phone: String(parsed.nationalNumber),
    e164: parsed.number,
  };
};

/** The CRM's split number back to WhatsApp's digits-only form ("+91", "12345" → "9112345"). */
export const toWhatsAppId = (phoneCountryCode: string, phone: string) =>
  `${phoneCountryCode}${phone}`.replace(/\D/g, "");
