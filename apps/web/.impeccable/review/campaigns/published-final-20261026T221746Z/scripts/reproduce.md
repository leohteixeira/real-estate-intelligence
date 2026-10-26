# Reproduce the bounded public campaign

Run from the product repository. Use the committed TypeScript probes and the strict integration
source loader below, with the installed sandbox-enabled Chromium helper. Existing compiled contracts
must be present. Do not run browser phases concurrently or submit another Ask to reproduce
reporting.

If the temporary source loader is absent, recreate this development-only bridge for the existing
source imports; it changes no application file or runtime behavior:

```bash
cat > /tmp/rei-ts-source-loader.mjs <<'EOF'
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && specifier.endsWith('.js')) {
        return nextResolve(specifier.slice(0, -3) + '.ts', context);
      }
      throw error;
    }
  },
});
EOF
```

```bash
CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox node --import /tmp/rei-ts-source-loader.mjs integration/fixtures/probe-web-production.ts <new-evidence-directory> 39236f94ae4432e00cb295a8a08b5b04f3fad35a read
CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox node --import /tmp/rei-ts-source-loader.mjs integration/fixtures/probe-web-final-production.ts <new-evidence-directory> 39236f94ae4432e00cb295a8a08b5b04f3fad35a search
```

The second probe also accepts `listing`, `privacy`, or `recovery` as separate sequential phases.
Native waits remain 15 seconds; no retries or deadline increases. Recovery aborts only browser GET
`/real-estate-intelligence/api/v1/ask/fixtures`, then removes the interruption before explicit
retry; it does not stop a server or mock a response. The original whole-context offline attempt is
inconclusive and preserved. The `confirm` phase of the first probe creates one
admission/confirmation; it is intentionally excluded from automatic replay. Reconcile its known run
before any new mutation. Paid explanation, scheduled collection and the presentation matrix are
reused only under the recorded dependency/image identities.

Raw evidence remains local under this campaign; only Markdown reports and the bounded executor are
versioned. The production stack predates the campaign and remains running. Resume from
attempts.jsonl and specific known operation identifiers, never from a blanket campaign restart.
