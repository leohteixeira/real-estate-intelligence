import nock from 'nock';

const ownedHosts = new Set<string>();

export function allowOwnedEndpoint(endpoint: string) {
  ownedHosts.add(new URL(endpoint).host);
}

export function guardNetwork() {
  ownedHosts.clear();
  // Dockerode addresses the Unix socket using an HTTP localhost URL.
  ownedHosts.add('localhost:80');
  const control = process.env.DOCKER_HOST;
  if (control && /^tcp:\/\//.test(control)) {
    ownedHosts.add(new URL(control.replace(/^tcp:/, 'http:')).host);
  }
  nock.disableNetConnect();
  nock.enableNetConnect((host) => ownedHosts.has(host));
}

export function finishNetwork() {
  const pending = nock.pendingMocks();
  nock.cleanAll();
  nock.enableNetConnect();
  ownedHosts.clear();
  if (pending.length) throw new Error(`Unconsumed external HTTP mocks: ${pending.join(', ')}`);
}
