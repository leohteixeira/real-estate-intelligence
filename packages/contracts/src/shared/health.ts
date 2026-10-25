/** Response of `GET /health`. */
export interface HealthResponse {
  readonly status: 'healthy';
}

/** Response of `GET /ready`. */
export interface ReadinessResponse {
  readonly status: 'ready' | 'not-ready';
  readonly database: 'available' | 'unavailable';
  readonly broker: 'available' | 'unavailable';
}
