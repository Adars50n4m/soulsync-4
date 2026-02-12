import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createSongPayload } from '#modules/songs/helpers/index.ts'
import type { IUseCase } from '#common/types/index.ts'
import type { SearchSongAPIResponseModel, SearchSongModel } from '#modules/search/models/index.ts'
import type { z } from 'zod'

export interface SearchSongsArgs {
  query: string
  page: number
  limit: number
}

export class SearchSongsUseCase implements IUseCase<SearchSongsArgs, z.infer<typeof SearchSongModel>> {
  constructor() {}

  async execute({ query, limit, page }: SearchSongsArgs): Promise<z.infer<typeof SearchSongModel>> {
    const { data } = await useFetch<z.infer<typeof SearchSongAPIResponseModel>>({
      endpoint: Endpoints.search.songs,
      params: {
        q: query,
        p: page,
        n: limit
      }
    })

    return {
      total: data.total,
      start: data.start,
      results: data.results?.map(createSongPayload).slice(0, limit) || []
    }
  }
}
