import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { envelope, schemaComponents, zodToOpenApi } from './zod-schema.js';

describe('zodToOpenApi', () => {
  it('documents formats without the regex Zod uses to check them', () => {
    const json = zodToOpenApi(z.object({ id: z.uuid(), email: z.email(), at: z.iso.datetime() }));
    expect(json.properties).toEqual({
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      at: { type: 'string', format: 'date-time' },
    });
  });

  it('keeps a custom pattern, which is part of the contract', () => {
    const json = zodToOpenApi(z.object({ slug: z.string().regex(/^[a-z-]+$/) }));
    expect(json.properties?.slug).toMatchObject({ pattern: '^[a-z-]+$' });
  });

  it('drops the safe-integer bounds Zod adds to every integer', () => {
    const json = zodToOpenApi(z.object({ n: z.number().int(), m: z.number().int().max(10) }));
    expect(json.properties?.n).toEqual({ type: 'integer' });
    expect(json.properties?.m).toEqual({ type: 'integer', maximum: 10 });
  });

  it('marks defaulted input fields optional and output fields required', () => {
    const schema = z.object({ limit: z.number().default(20) });
    expect(zodToOpenApi(schema, 'input').required).toBeUndefined();
    expect(zodToOpenApi(schema, 'output').required).toEqual(['limit']);
  });

  it('makes a named schema a component, referenced wherever it appears', () => {
    const Thing = z.object({ id: z.uuid() }).meta({ id: 'SpecThing' });
    const Page = z.object({ items: z.array(Thing) }).meta({ id: 'SpecThingPage' });
    expect(zodToOpenApi(Page, 'output')).toEqual({ $ref: '#/components/schemas/SpecThingPage' });
    expect(zodToOpenApi(z.object({ thing: Thing }), 'output').properties?.thing).toEqual({
      $ref: '#/components/schemas/SpecThing',
    });
    expect(schemaComponents()).toMatchObject({
      SpecThing: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      SpecThingPage: {
        properties: { items: { type: 'array', items: { $ref: '#/components/schemas/SpecThing' } } },
      },
    });
  });

  it('refuses one name for two different schemas when the document is built', () => {
    const named = z.object({ limit: z.number().default(20) }).meta({ id: 'SpecDefaulted' });
    // Input and output differ (the default): one name cannot describe both.
    zodToOpenApi(z.object({ query: named }), 'input');
    zodToOpenApi(z.object({ page: named }), 'output');
    expect(() => schemaComponents()).toThrow(/"SpecDefaulted"/);
  });
});

describe('envelope', () => {
  it('wraps a payload schema in { data, message }', () => {
    expect(envelope({ type: 'string' })).toEqual({
      type: 'object',
      required: ['data', 'message'],
      properties: { data: { type: 'string' }, message: { type: 'string' } },
    });
  });
});
