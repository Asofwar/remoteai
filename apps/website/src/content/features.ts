import { workspaceFeatures } from './features-workspace';
import { managementFeatures } from './features-management';
import { toolFeatures } from './features-tools';
import { personalFeatures } from './features-personal';

export const features = [...workspaceFeatures, ...managementFeatures, ...toolFeatures, ...personalFeatures];

export function findFeature(slug: string) {
  return features.find((feature) => feature.slug === slug);
}
