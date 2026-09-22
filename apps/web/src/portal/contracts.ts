export type SupplierResolution = Readonly<{
  supplierId: string | null;
}>;

export type DirectLookupCategory =
  | 'success'
  | 'fiscal_status'
  | 'consumption_limit'
  | 'configuration_error'
  | 'transport_unavailable'
  | 'technical_error';

export type DirectLookupResult = Readonly<{
  category: DirectLookupCategory;
  xml: string | null;
  cStat: string | null;
  message: string;
}>;

export type PortalOperationState =
  | 'waiting_for_user'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PortalOperationStatus = Readonly<{
  operationId: string;
  state: PortalOperationState;
  message: string | null;
  xml: string | null;
}>;
