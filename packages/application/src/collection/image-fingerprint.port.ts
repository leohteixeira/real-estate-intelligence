/** Transient bytes enter infrastructure computation and never become persistent artifacts. */
export interface ImageFingerprintComputer {
  compute(bytes: Uint8Array, signal: AbortSignal): Promise<string>;
}
