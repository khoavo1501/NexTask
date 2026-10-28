import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadRootEnvFile(): void {
  // Từ apps/api/src/config lên root repository là bốn cấp.
  const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(rootEnvPath)) {
    process.loadEnvFile(rootEnvPath);
  }
}
