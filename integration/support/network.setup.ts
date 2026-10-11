import { afterEach, beforeEach } from 'vitest';
import { finishNetwork, guardNetwork } from './network.ts';

beforeEach(guardNetwork);
afterEach(finishNetwork);
