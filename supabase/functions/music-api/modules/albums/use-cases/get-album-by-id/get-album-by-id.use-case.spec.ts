import { AlbumModel } from '#modules/albums/models/index.ts'
import { GetAlbumByIdUseCase } from '#modules/albums/use-cases/index.ts'
import { beforeAll, describe, expect, it } from 'vitest'

describe('GetAlbumById', () => {
  let getAlbumByIdUseCase: GetAlbumByIdUseCase

  beforeAll(() => {
    getAlbumByIdUseCase = new GetAlbumByIdUseCase()
  })

  it('should get album by id', async () => {
    const album = await getAlbumByIdUseCase.execute('23241654')

    expect(() => AlbumModel.parse(album)).not.toThrow()
  })

  it('should not get album by id for wrong album id', async () => {
    const album = await getAlbumByIdUseCase.execute('random-no-id')

    expect(() => AlbumModel.parse(album)).not.toThrow()
  })
})
