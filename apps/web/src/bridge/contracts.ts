export const BRIDGE_BASE_URL = 'http://127.0.0.1:17345/api/v1' as const;

export type BridgeHealth = {
  version: string;
  status: 'ok';
  webView2Available: boolean;
  certificateSelected: boolean;
};

export type CertificateSummary = {
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  thumbprint: string;
};

export type CertificateCatalog = {
  certificates: CertificateSummary[];
  selectedThumbprint: string | null;
};
