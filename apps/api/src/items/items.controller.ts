import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { fieldError } from '../common/errors/validation-failed.exception.js';
import type { ApiEnvelope } from '../common/interceptors/transform.interceptor.js';
import { ApiData, ApiErrors, ZodBody, ZodQuery } from '../common/openapi/index.js';
import type { Page } from '../common/pagination.js';
import type { RequestUser } from '../common/types/request-user.js';
import {
  type CreateItemDto,
  CreateItemSchema,
  IDEMPOTENCY_KEY,
  type ItemQuery,
  ItemQuerySchema,
  type ItemResponse,
  ItemPageSchema,
  ItemSchema,
} from './dto/item.schemas.js';
import { ItemsService } from './items.service.js';

// The signed-in user's own items, the app's example feature: every route
// reads or writes only the caller's (docs/authorization.md).
@ApiTags('items')
@Controller('items')
@Auth()
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @ApiOperation({
    summary: "The signed-in user's items, newest first",
    description:
      'Only the caller’s own items. q keeps those whose title contains it, whatever the letter case.',
  })
  @ZodQuery(ItemQuerySchema)
  @ApiData(ItemPageSchema)
  @ApiErrors(400)
  list(@CurrentUser() user: RequestUser, @Query() query: ItemQuery): Promise<Page<ItemResponse>> {
    return this.items.list(user.id, query);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create an item',
    description:
      'With an Idempotency-Key, a retry (same key, same body) gets the first item back, 201 again, instead of a second one. 409: a request with the key is still being processed (retry later). 422: the key was used with another body.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'A key the client generates for this create (a UUID) and keeps across its retries: 1 to 255 visible ASCII characters.',
    schema: { type: 'string', maxLength: 255 },
  })
  @ZodBody(CreateItemSchema)
  @ApiData(ItemSchema, { status: 201 })
  @ApiErrors(400, 409, 422)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateItemDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<ApiEnvelope<ItemResponse>> {
    let key: string | undefined;
    if (idempotencyKey !== undefined) {
      const parsed = IDEMPOTENCY_KEY.safeParse(idempotencyKey);
      if (!parsed.success) {
        throw fieldError('Idempotency-Key', parsed.error.issues[0]?.message ?? 'Invalid');
      }
      key = parsed.data;
    }
    return { data: await this.items.create(user.id, body, key), message: 'Item created' };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One item',
    description: 'Another user’s item answers 404, exactly like a missing one.',
  })
  @ApiData(ItemSchema)
  @ApiErrors(400, 404)
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ItemResponse> {
    return this.items.findOwned(user.id, id);
  }
}
