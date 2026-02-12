import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createArtistPayload } from '#modules/artists/helpers/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'
import type { ArtistAPIResponseModel, ArtistModel } from '#modules/artists/models/index.ts'
import type { z } from 'zod'

export interface GetArtistByLinkArgs {
  token: string
  page: number
  songCount: number
  albumCount: number
  sortBy: 'popularity' | 'latest' | 'alphabetical'
  sortOrder: 'asc' | 'desc'
}

export class GetArtistByLinkUseCase implements IUseCase<GetArtistByLinkArgs, z.infer<typeof ArtistModel>> {
  constructor() {}

  async execute({ token, page, songCount, albumCount, sortBy, sortOrder }: GetArtistByLinkArgs) {
    const { data } = await useFetch<z.infer<typeof ArtistAPIResponseModel>>({
      endpoint: Endpoints.artists.link,
      params: {
        token,
        n_song: songCount,
        n_album: albumCount,
        page,
        sort_order: sortOrder,
        category: sortBy,
        type: 'artist'
      }
    })

    if (!data) throw new HTTPException(404, { message: 'artist not found' })

    return createArtistPayload(data)
  }
}
