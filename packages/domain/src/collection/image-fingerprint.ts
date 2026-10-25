/** D-089 consumes normalized 9x8 grayscale bytes, row-major, MSB first. */
export function dhash64(pixels: Uint8Array): string {
  if (pixels.length !== 72) throw new TypeError('Expected normalized 9x8 grayscale pixels.');
  let bits = 0n;
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      const offset = row * 9 + column;
      bits = (bits << 1n) | (pixels[offset + 1]! > pixels[offset]! ? 1n : 0n);
    }
  }
  return `dhash64-v1:${bits.toString(16).padStart(16, '0')}`;
}

export function fingerprintDistance(left: string, right: string): number {
  const pattern = /^dhash64-v1:[a-f0-9]{16}$/;
  if (!pattern.test(left) || !pattern.test(right))
    throw new TypeError('Expected matching dhash64-v1 fingerprints.');
  let difference = BigInt(`0x${left.slice(11)}`) ^ BigInt(`0x${right.slice(11)}`);
  let distance = 0;
  while (difference !== 0n) {
    difference &= difference - 1n;
    distance++;
  }
  return distance;
}

export function fingerprintSimilarity(left: string, right: string): number {
  return 1 - fingerprintDistance(left, right) / 64;
}
