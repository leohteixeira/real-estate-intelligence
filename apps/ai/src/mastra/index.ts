import { Mastra } from '@mastra/core';

/**
 * Mastra runs as a separate application.
 *
 * It has **no** database credentials, no object storage credentials and no
 * dependency on `@rei/infrastructure`. It reaches domain capabilities only
 * through typed tools that call the API's versioned HTTP contract, or through
 * application services explicitly exposed to it.
 *
 * No agent and no tool is registered yet: the tools will be added together with
 * the application services they are allowed to call.
 */
export const mastra = new Mastra({
  agents: {},
  workflows: {},
});
