import { z } from 'zod';
import { pageOf, PageQuerySchema } from '../../common/pagination.js';

// The example resource (docs/authorization.md): named in the contract, the
// app's generated types call them Item, ItemPage and CreateItemRequest.

export const ItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    /** Absent when the item has none. */
    description: z.string().optional(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Item' });
export type ItemResponse = z.infer<typeof ItemSchema>;

export const ItemPageSchema = pageOf(ItemSchema).meta({ id: 'ItemPage' });

// Trimmed; an empty description is no description.
export const CreateItemSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(120, 'At most 120 characters'),
    description: z
      .string()
      .trim()
      .max(2000, 'At most 2000 characters')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
  })
  .meta({ id: 'CreateItemRequest' });
export type CreateItemDto = z.infer<typeof CreateItemSchema>;

export const ItemQuerySchema = PageQuerySchema.extend({
  /** Only the items whose title contains it, whatever the letter case. */
  q: z.string().trim().max(100).optional(),
});
export type ItemQuery = z.infer<typeof ItemQuerySchema>;

// A client-chosen key, a UUID for instance: visible ASCII, at most 255.
export const IDEMPOTENCY_KEY = z
  .string()
  .regex(/^[\x21-\x7E]{1,255}$/, 'Between 1 and 255 visible ASCII characters');
