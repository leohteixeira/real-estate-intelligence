/** Explicit opt-in; the default path needs neither build output nor provider modules. */
async function main(): Promise<void> {
  if (!process.argv.includes('--live')) {
    console.info('Opt in with --live after building @rei/ai and supplying AI_GATEWAY_API_KEY.');
  } else if (!process.env.AI_GATEWAY_API_KEY) {
    console.error('Intent probe unavailable: AI_GATEWAY_API_KEY is required.');
    process.exitCode = 1;
  } else {
    try {
      const { runIntentProbe } = await import('../dist/models/intent-probe.js');
      const result = await runIntentProbe(process.env.AI_GATEWAY_API_KEY);
      console.info(JSON.stringify(result));
      if (!result.passed) process.exitCode = 1;
    } catch {
      console.error('Intent probe unavailable: build or probe initialization failed.');
      process.exitCode = 1;
    }
  }
}
void main();
