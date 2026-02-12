import { ArtistAlbumModel } from '#modules/artists/models/index.ts'
import { GetArtistAlbumsUseCase } from '#modules/artists/use-cases/index.ts'
import { beforeAll, describe, expect, it } from 'vitest'

describe('GetArtistAlbums', () => {
  let getArtistAlbumsUseCase: GetArtistAlbumsUseCase

  beforeAll(() => {
    getArtistAlbumsUseCase = new GetArtistAlbumsUseCase()
  })

  it('should get artist albums by artist id and return a list of albums', async () => {
    const albums = await getArtistAlbumsUseCase.execute({
      artistId: '1274170',
      page: 1,
      sortBy: 'popularity',
      sortOrder: 'asc'
    })

    expect(() => ArtistAlbumModel.parse(albums)).not.toThrow()
  })
})
