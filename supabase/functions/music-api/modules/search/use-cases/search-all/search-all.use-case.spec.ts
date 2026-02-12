import { SearchModel } from '#modules/search/models/index.ts'
import { SearchAllUseCase } from '#modules/search/use-cases/index.ts'
import { beforeAll, describe, expect, it } from 'vitest'

describe('SearchEverything', () => {
  let searchAllUseCase: SearchAllUseCase

  beforeAll(() => {
    searchAllUseCase = new SearchAllUseCase()
  })

  it('should search everything by query and return a list of results', async () => {
    const results = await searchAllUseCase.execute('imagine+dragons+bones')

    expect(() => SearchModel.parse(results)).not.toThrow()
  })
})
