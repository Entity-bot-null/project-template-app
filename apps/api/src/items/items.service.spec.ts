import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../common/utils/sha256.js';
import type {
  ClaimOutcome,
  IdempotencyService,
} from '../infrastructure/coordination/coordination.service.js';
import { RedisUnavailableError } from '../infrastructure/redis/redis.service.js';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_REUSED,
  ITEM_NOT_FOUND,
  ItemsService,
} from './items.service.js';

// The queries against PostgreSQL (the unique key, case-insensitive search,
// ordering) are items.int.spec.ts; here, the decisions.

const OWNER = '0190b6a1-0000-7000-8000-000000000001';
const KEY = '00000000-0000-4000-8000-000000000001';
const CREATED_AT = new Date('2026-10-13T10:00:00.000Z');
const INPUT = { title: 'Buy milk', description: 'Two litres' };
const HASH = sha256Hex(JSON.stringify([INPUT.title, INPUT.description]));
const ROW = { id: 'i1', title: INPUT.title, description: INPUT.description, createdAt: CREATED_AT };
const RESPONSE = {
  id: 'i1',
  title: 'Buy milk',
  description: 'Two litres',
  createdAt: '2026-10-13T10:00:00.000Z',
};

function setup(outcome: ClaimOutcome | Error = { status: 'claimed', claim: claim() }) {
  const item = {
    findMany: vi.fn(() => Promise.resolve([ROW, { ...ROW, id: 'i2', description: null }])),
    count: vi.fn(() => Promise.resolve(2)),
    findFirst: vi.fn(() => Promise.resolve(ROW as typeof ROW | null)),
    findUnique: vi.fn(() => Promise.resolve(null as (typeof ROW & { requestHash: string }) | null)),
    create: vi.fn(() => Promise.resolve(ROW)),
  };
  const prisma = {
    item,
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const idempotency = {
    claim: vi.fn(() =>
      outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome),
    ),
  };
  const service = new ItemsService(
    prisma as unknown as PrismaService,
    idempotency as unknown as IdempotencyService,
  );
  return { service, item, idempotency };
}

function claim() {
  return { complete: vi.fn(() => Promise.resolve()), release: vi.fn(() => Promise.resolve()) };
}

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('ItemsService.list', () => {
  it("lists the owner's items only, newest first, without a description where there is none", async () => {
    const { service, item } = setup();
    const page = await service.list(OWNER, { limit: 20, offset: 40 });
    expect(item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: OWNER },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        skip: 40,
      }),
    );
    expect(item.count).toHaveBeenCalledWith({ where: { ownerId: OWNER } });
    expect(page).toEqual({
      items: [RESPONSE, { id: 'i2', title: 'Buy milk', createdAt: RESPONSE.createdAt }],
      total: 2,
    });
  });

  it('keeps the items whose title contains q, whatever the case; an empty q filters nothing', async () => {
    const { service, item } = setup();
    await service.list(OWNER, { limit: 20, offset: 0, q: 'MILK' });
    const where = { ownerId: OWNER, title: { contains: 'MILK', mode: 'insensitive' } };
    expect(item.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    // LIKE's wildcards and its escape character are searched for literally.
    await service.list(OWNER, { limit: 20, offset: 0, q: '100%_\\' });
    expect(item.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { ownerId: OWNER, title: { contains: '100\\%\\_\\\\', mode: 'insensitive' } },
      }),
    );
    await service.list(OWNER, { limit: 20, offset: 0, q: 'MILK' });
    expect(item.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(item.count).toHaveBeenCalledWith({ where });
    await service.list(OWNER, { limit: 20, offset: 0, q: '' });
    expect(item.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { ownerId: OWNER } }),
    );
  });
});

describe('ItemsService.findOwned', () => {
  it("reads an item only through its owner: another user's answers 404 like a missing one", async () => {
    const { service, item } = setup();
    await expect(service.findOwned(OWNER, 'i1')).resolves.toEqual(RESPONSE);
    expect(item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'i1', ownerId: OWNER } }),
    );
    item.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOwned(OWNER, 'i1')).rejects.toThrow(
      new NotFoundException(ITEM_NOT_FOUND),
    );
  });
});

describe('ItemsService.create', () => {
  it('creates for the owner; without a key, no claim and no key stored', async () => {
    const { service, item, idempotency } = setup();
    await expect(service.create(OWNER, INPUT)).resolves.toEqual(RESPONSE);
    expect(item.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ownerId: OWNER, ...INPUT } }),
    );
    expect(idempotency.claim).not.toHaveBeenCalled();
  });

  it('with a key: claims it (hashed with the owner), stores it with a hash of the body, completes', async () => {
    const done = claim();
    const { service, item, idempotency } = setup({ status: 'claimed', claim: done });
    await expect(service.create(OWNER, INPUT, KEY)).resolves.toEqual(RESPONSE);
    expect(idempotency.claim).toHaveBeenCalledWith(
      'items:create',
      sha256Hex(`${OWNER}:${KEY}`),
      expect.objectContaining({ processingTtlSec: 60 }),
    );
    expect(item.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ownerId: OWNER, ...INPUT, idempotencyKey: KEY, requestHash: HASH },
      }),
    );
    expect(done.complete).toHaveBeenCalledOnce();
    expect(done.release).not.toHaveBeenCalled();
  });

  it('answers a retry (same key, same body) with the first item, creating nothing', async () => {
    for (const outcome of [{ status: 'claimed', claim: claim() }, { status: 'done' }] as const) {
      const { service, item } = setup(outcome);
      item.findUnique.mockResolvedValueOnce({ ...ROW, requestHash: HASH });
      await expect(service.create(OWNER, INPUT, KEY)).resolves.toEqual(RESPONSE);
      expect(item.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId_idempotencyKey: { ownerId: OWNER, idempotencyKey: KEY } },
        }),
      );
      expect(item.create).not.toHaveBeenCalled();
    }
  });

  it('answers 422 for the key used with another body, and gives the claim back', async () => {
    const taken = claim();
    const { service, item } = setup({ status: 'claimed', claim: taken });
    item.findUnique.mockResolvedValueOnce({ ...ROW, requestHash: sha256Hex('another body') });
    await expect(service.create(OWNER, INPUT, KEY)).rejects.toThrow(
      new UnprocessableEntityException(IDEMPOTENCY_KEY_REUSED),
    );
    expect(taken.release).toHaveBeenCalledOnce();
    expect(taken.complete).not.toHaveBeenCalled();
  });

  it('answers 409 while a request with the key is still running, touching nothing', async () => {
    const { service, item } = setup({ status: 'in-progress' });
    await expect(service.create(OWNER, INPUT, KEY)).rejects.toThrow(
      new ConflictException(IDEMPOTENCY_IN_PROGRESS),
    );
    expect(item.findUnique).not.toHaveBeenCalled();
    expect(item.create).not.toHaveBeenCalled();
  });

  it('answers with the winner when another request with the key created it meanwhile', async () => {
    const { service, item } = setup();
    item.create.mockRejectedValueOnce(uniqueViolation());
    item.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...ROW, requestHash: HASH });
    await expect(service.create(OWNER, INPUT, KEY)).resolves.toEqual(RESPONSE);
  });

  it('passes any other failure on and gives the claim back', async () => {
    const lost = claim();
    const { service, item } = setup({ status: 'claimed', claim: lost });
    item.create.mockRejectedValueOnce(new Error('database down'));
    await expect(service.create(OWNER, INPUT, KEY)).rejects.toThrow('database down');
    expect(lost.release).toHaveBeenCalledOnce();

    // A unique violation without a winner to read is not a replay either.
    const odd = setup();
    odd.item.create.mockRejectedValueOnce(uniqueViolation());
    await expect(odd.service.create(OWNER, INPUT, KEY)).rejects.toThrow('Unique constraint');
  });

  it('still creates once without Redis: the database key holds; other claim failures pass on', async () => {
    const degraded = setup(new RedisUnavailableError('down'));
    await expect(degraded.service.create(OWNER, INPUT, KEY)).resolves.toEqual(RESPONSE);
    expect(degraded.item.create).toHaveBeenCalledOnce();

    const broken = setup(new Error('bug'));
    await expect(broken.service.create(OWNER, INPUT, KEY)).rejects.toThrow('bug');
    expect(broken.item.create).not.toHaveBeenCalled();
  });
});
