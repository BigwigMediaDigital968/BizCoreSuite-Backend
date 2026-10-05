import { INTEGRATION_PROVIDER, type IntegrationProvider } from "../constants/integration.js";
import { AppError } from "../utils/AppError.js";
import { watiAdapter } from "./providers/wati.js";
import type { ProviderAdapter } from "./types.js";

/** Add new lead-source providers here. */
const ADAPTERS: Record<IntegrationProvider, ProviderAdapter> = {
  [INTEGRATION_PROVIDER.WATI]: watiAdapter,
};

export const getAdapter = (provider: string): ProviderAdapter => {
  const adapter = ADAPTERS[provider as IntegrationProvider];
  if (!adapter) {
    throw new AppError(`Unsupported integration provider: ${provider}`, 400, "UNSUPPORTED_PROVIDER");
  }
  return adapter;
};

export const isSupportedProvider = (provider: string): provider is IntegrationProvider =>
  provider in ADAPTERS;
