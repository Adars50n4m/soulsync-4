import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createAlbumPayload } from '#modules/albums/helpers/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'
import type { AlbumAPIResponseModel, AlbumModel } from '#modules/albums/models/index.ts'
import type { z } from 'zod'

export class GetAlbumByIdUseCase implements IUseCase<string, z.infer<typeof AlbumModel>> {
  constructor() {}

  async execute(id: string) {
    const { data } = await useFetch<z.infer<typeof AlbumAPIResponseModel>>({
      endpoint: Endpoints.albums.id,
      params: { albumid: id }
    })

    if (!data) throw new HTTPException(404, { message: 'album not found' })

    return createAlbumPayload(data)
  }
}
