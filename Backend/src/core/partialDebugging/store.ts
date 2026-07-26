import type { PartialDebuggingGraphBundle } from '../../types/partialDebugging.js';
const builds = new Map<string, PartialDebuggingGraphBundle>();
export const savePartialDebuggingBuild = (bundle: PartialDebuggingGraphBundle) => builds.set(bundle.summary.buildId, bundle);
export const getPartialDebuggingBuild = (buildId: string) => builds.get(buildId);
