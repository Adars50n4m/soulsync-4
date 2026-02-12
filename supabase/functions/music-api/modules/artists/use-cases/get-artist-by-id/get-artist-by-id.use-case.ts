import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createArtistPayload } from '#modules/artists/helpers/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'
import type { ArtistAPIResponseModel, ArtistModel } from '#modules/artists/models/index.ts'
import type { z } from 'zod'

export interface GetArtistByIdArgs {
  artistId: string
  page: number
  songCount: number
  albumCount: number
  sortBy: 'popularity' | 'latest' | 'alphabetical'
  sortOrder: 'asc' | 'desc'
}

export class GetArtistByIdUseCase implements IUseCase<GetArtistByIdArgs, z.infer<typeof ArtistModel>> {
  constructor() {}

  async execute({ artistId, page, songCount, albumCount, sortBy, sortOrder }: GetArtistByIdArgs) {
    const { data } = await useFetch<z.infer<typeof ArtistAPIResponseModel>>({
      endpoint: Endpoints.artists.id,
      params: {
        artistId,
        n_song: songCount,
        n_album: albumCount,
        page,
        sort_order: sortOrder,
        category: sortBy
      }
    })

    if (!data) throw new HTTPException(404, { message: 'artist not found' })

    return createArtistPayload(data)
  }
}
