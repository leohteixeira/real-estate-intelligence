import { config } from './config';

export function App() {
  return (
    <main>
      <h1>Real Estate Intelligence</h1>
      <p>
        Application foundation. The interface talks to the backend exclusively through the versioned
        HTTP contract at <code>{config.apiBaseUrl}/api/v1</code>.
      </p>
    </main>
  );
}
