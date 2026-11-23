/**
 * Errors with a stable code. Routes turn them into { error: { code, message, details? } } with the HTTP status.
 * The codes are listed in contract.md.
 */
export const ORDER_ERRORS = {
  VALIDATION: 400,
  PROFILE_REQUIRED: 400,
  PAYMENT_METHOD_REQUIRED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STORE_NOT_FOUND: 404,
  ADDRESS_NOT_FOUND: 404,
  PRODUCT_UNAVAILABLE: 409,
  OUT_OF_STOCK: 409,
  QUANTITY_LIMIT: 409,
  PRICE_CHANGED: 409,
  INVALID_TRANSITION: 409,
  STATUS_LOCKED: 409,
  INVALID_PAYMENT_TRANSITION: 409,
  NOT_CANCELLABLE: 409,
  NO_RETURN: 404,
  RETURNS_OFF: 409,
  NOT_RETURNABLE: 409,
  RETURN_EXISTS: 409,
  RETURN_WINDOW_CLOSED: 409,
  NOT_WITHDRAWABLE: 409,
  ADDRESS_IN_USE: 409,
  QUOTE_NOT_OPEN: 409,
  BUSY: 503,
  NOT_CONFIGURED: 500,
  INTERNAL: 500,
} as const;
export type OrderErrorCode = keyof typeof ORDER_ERRORS;

export class OrderError extends Error {
  readonly status: number;
  constructor(
    readonly code: OrderErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = ORDER_ERRORS[code];
  }
}

export const isOrderError = (e: unknown): e is OrderError => e instanceof OrderError;
