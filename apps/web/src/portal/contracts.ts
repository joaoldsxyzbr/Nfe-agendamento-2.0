export type SupplierResolution = Readonly<{
  supplierId: string | null;
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
