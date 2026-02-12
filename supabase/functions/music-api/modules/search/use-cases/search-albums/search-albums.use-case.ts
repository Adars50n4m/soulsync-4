import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createSearchAlbumPayload } from '#modules/search/helpers/index.ts'
import type { IUseCase } from '#common/types/index.ts'
import type { SearchAlbumAPIResponseModel, SearchAlbumModel } from '#modules/search/models/index.ts'
import type { z } from 'zod'

export interface SearchAlbumsArgs {
  query: string
  page: number
  limit: number
}

export class SearchAlbumsUseCase implements IUseCase<SearchAlbumsArgs, z.infer<typeof SearchAlbumModel>> {
  constructor() {}

  async execute({ query, limit, page }: SearchAlbumsArgs): Promise<z.infer<typeof SearchAlbumModel>> {
    const { data } = await useFetch<z.infer<typeof SearchAlbumAPIResponseModel>>({
      endpoint: Endpoints.search.albums,
      params: {
        q: query,
        p: page,
        n: limit
      }
    })

    return createSearchAlbumPayload(data)
  }
}
