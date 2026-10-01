import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'local.pulpreader',
  appName: 'Banca',
  webDir: 'dist',
  // the bridge would otherwise log every plugin result (whole SQL result sets) in debug builds
  loggingBehavior: 'none',
};

export default config;
