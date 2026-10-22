import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Page } from '../common/pagination.js';
import { sha256Hex } from '../common/utils/sha256.js';
import {
  type ClaimOutcome,
  IdempotencyService,
} from '../infrastructure/coordination/coordination.service.js';
import { RedisUnavailableError } from '../infrastructure/redis/redis.service.js';
import { recordDegradation } from '../observability/metrics.js';
import { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateItemDto, ItemQuery, ItemResponse } from './dto/item.schemas.js';

export const ITEM_NOT_FOUND = 'Item not found';
export const IDEMPOTENCY_IN_PROGRESS =
  'A request with this Idempotency-Key is still being processed: retry it later';
export const IDEMPOTENCY_KEY_REUSED =
  'This Idempotency-Key was used for a different request: use a new key';

/** How long a create with a key may take; past it, a retry of it is processed. */
const CLAIM_PROCESSING_SEC = 60;
/** How long the claim says "done"; the database remembers the key for good. */
const CLAIM_DONE_SEC = 24 * 60 * 60;

const ITEM_SELECT = { id: true, title: true, description: true, createdAt: true } as const;

interface ItemRow {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
}

// The example resource. Object-level authorization (BOLA/IDOR,
// docs/authorization.md) is part of every query: the owner is in the WHERE,
// so another user's item answers 404, exactly like a missing one, and ids
// cannot be probed for existence.
@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** The owner's items, newest first (createdAt, then id: pages never overlap or skip). */
  async list(ownerId: string, { limit, offset, q }: ItemQuery): Promise<Page<ItemResponse>> {
    const where: Prisma.ItemWhereInput = {
      ownerId,
      ...(q !== undefined &&
        q !== '' && { title: { contains: likeLiteral(q), mode: 'insensitive' } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        where,
        select: ITEM_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.item.count({ where }),
    ]);
    return { items: rows.map(toResponse), total };
  }

  async findOwned(ownerId: string, id: string): Promise<ItemResponse> {
    const row = await this.prisma.item.findFirst({ where: { id, ownerId }, select: ITEM_SELECT });
    if (row === null) throw new NotFoundException(ITEM_NOT_FOUND);
    return toResponse(row);
  }

  /**
   * Creates an item. With an Idempotency-Key (a client sends one per create
   * and keeps it across its retries), a retry gets the first item back instead of a
   * second one (docs/api-conventions.md#idempotency): the key is stored with
   * the item under a unique constraint, the guarantee; a claim on the key
   * (IdempotencyService) answers 409 to a retry that arrives while the first
   * request is still running. The same key with another body answers 422.
   */
  async create(
    ownerId: string,
    input: CreateItemDto,
    idempotencyKey?: string,
  ): Promise<ItemResponse> {
    if (idempotencyKey === undefined) {
      return toResponse(
        await this.prisma.item.create({ data: { ownerId, ...input }, select: ITEM_SELECT }),
      );
    }
    const requestHash = sha256Hex(JSON.stringify([input.title, input.description ?? null]));
    const outcome = await this.claim(ownerId, idempotencyKey);
    if (outcome?.status === 'in-progress') throw new ConflictException(IDEMPOTENCY_IN_PROGRESS);
    const claim = outcome?.status === 'claimed' ? outcome.claim : undefined;
    try {
      const item = await this.createOnce(ownerId, input, idempotencyKey, requestHash);
      await claim?.complete();
      return item;
    } catch (error) {
      await claim?.release();
      throw error;
    }
  }

  // Without Redis when it is required (or gone), keyed creates still work:
  // the database's unique key alone keeps them single; a concurrent retry
  // then waits for the first instead of getting 409.
  private async claim(ownerId: string, key: string): Promise<ClaimOutcome | undefined> {
    try {
      return await this.idempotency.claim('items:create', sha256Hex(`${ownerId}:${key}`), {
        processingTtlSec: CLAIM_PROCESSING_SEC,
        doneTtlSec: CLAIM_DONE_SEC,
      });
    } catch (error) {
      if (!(error instanceof RedisUnavailableError)) throw error;
      recordDegradation('items-idempotency', 'redis');
      return undefined;
    }
  }

  private async createOnce(
    ownerId: string,
    input: CreateItemDto,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<ItemResponse> {
    const existing = await this.findByKey(ownerId, idempotencyKey);
    if (existing !== null) return replay(existing, requestHash);
    try {
      return toResponse(
        await this.prisma.item.create({
          data: { ownerId, ...input, idempotencyKey, requestHash },
          select: ITEM_SELECT,
        }),
      );
    } catch (error) {
      // Another request with the key created it meanwhile (the claim was
      // lost or skipped): that one is the answer.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.findByKey(ownerId, idempotencyKey);
        if (winner !== null) return replay(winner, requestHash);
      }
      throw error;
    }
  }

  private findByKey(ownerId: string, idempotencyKey: string) {
    return this.prisma.item.findUnique({
      where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } },
      select: { ...ITEM_SELECT, requestHash: true },
    });
  }
}

function replay(row: ItemRow & { requestHash: string | null }, requestHash: string): ItemResponse {
  if (row.requestHash !== requestHash)
    throw new UnprocessableEntityException(IDEMPOTENCY_KEY_REUSED);
  return toResponse(row);
}

// `contains` becomes ILIKE '%…%' with the value as it is: % and _ would match
// anything. Escaped (backslash, PostgreSQL's default), they are what to find.
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function toResponse(row: ItemRow): ItemResponse {
  return {
    id: row.id,
    title: row.title,
    ...(row.description !== null && { description: row.description }),
    createdAt: row.createdAt.toISOString(),
  };
}
