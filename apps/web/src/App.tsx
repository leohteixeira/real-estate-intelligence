import { config } from './config';
import { LandingPage } from './landing/LandingPage';

export function App() {
  return <LandingPage demoUrl={config.demoUrl} repositoryUrl={config.repositoryUrl} />;
}
