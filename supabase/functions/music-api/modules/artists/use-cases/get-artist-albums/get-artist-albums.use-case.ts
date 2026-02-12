import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createAlbumPayload } from '#modules/albums/helpers/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'
import type { ArtistAlbumAPIResponseModel, ArtistAlbumModel } from '#modules/artists/models/index.ts'
import type { z } from 'zod'

export interface GetArtistAlbumsArgs {
  artistId: string
  page: number
  sortBy: 'popularity' | 'latest' | 'alphabetical'
  sortOrder: 'asc' | 'desc'
}

export class GetArtistAlbumsUseCase implements IUseCase<GetArtistAlbumsArgs, z.infer<typeof ArtistAlbumModel>> {
  constructor() {}

  async execute({ artistId, page, sortOrder, sortBy }: GetArtistAlbumsArgs) {
    const { data } = await useFetch<z.infer<typeof ArtistAlbumAPIResponseModel>>({
      endpoint: Endpoints.artists.albums,
      params: {
        artistId,
        page,
        sort_order: sortOrder,
        category: sortBy
      }
    })

    if (!data) throw new HTTPException(404, { message: 'artist albums not found' })

    return {
      total: data.topAlbums.total,
      albums: data.topAlbums.albums.map((album) => createAlbumPayload(album))
    }
  }
}
