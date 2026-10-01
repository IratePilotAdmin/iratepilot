import {z} from 'zod';

const uuid=z.string().uuid();
const actor=z.object({id:uuid}).strict();
export const revenueHttpQualificationConfigSchema=z.object({
  branch:z.object({project_ref:z.string().regex(/^[a-z]{20}$/),parent_project_ref:z.literal('eiqmdldjnedqgbtoozqa'),
    is_default:z.literal(false),with_data:z.literal(false),name:z.string().startsWith('revenue-auth-')}).passthrough(),
  publishableKey:z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
  tenantId:z.literal('00000000-0000-4000-8000-000000000001'),
  propertyId:z.literal('00000000-0000-4000-8000-000000000002'),
  requestId:z.literal('00000000-0000-4000-8000-000000000006'),
  planId:z.literal('00000000-0000-4000-8000-000000000004'),
  actors:z.object({owner:actor,manager:actor,staff:actor}).strict(),
}).strict().refine(config=>!['eiqmdldjnedqgbtoozqa','allliumarkejinplrggl'].includes(config.branch.project_ref)
  &&new Set(Object.values(config.actors).map(a=>a.id.toLowerCase())).size===3,
  'Use a separate branch and three distinct test actors');
