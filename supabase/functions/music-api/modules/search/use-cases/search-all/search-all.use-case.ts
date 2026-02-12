import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createSearchPayload } from '#modules/search/helpers/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'
import type { SearchAPIResponseModel, SearchModel } from '#modules/search/models/index.ts'
import type { z } from 'zod'

export class SearchAllUseCase implements IUseCase<string, z.infer<typeof SearchModel>> {
  async execute(query: string): Promise<z.infer<typeof SearchModel>> {
    const { data } = await useFetch<z.infer<typeof SearchAPIResponseModel>>({
      endpoint: Endpoints.search.all,
      params: { query }
    })

    if (!data) throw new HTTPException(404, { message: `no results found for ${query}` })

    return createSearchPayload(data)
  }
}
