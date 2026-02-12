import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createSongPayload } from '#modules/songs/helpers/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'
import type { SongAPIResponseModel, SongModel } from '#modules/songs/models/index.ts'
import type { z } from 'zod'

export class GetSongByLinkUseCase implements IUseCase<string, z.infer<typeof SongModel>[]> {
  constructor() {}

  async execute(token: string) {
    const { data } = await useFetch<{ songs: z.infer<typeof SongAPIResponseModel>[] }>({
      endpoint: Endpoints.songs.link,
      params: { token, type: 'song' }
    })

    if (!data.songs?.length) throw new HTTPException(404, { message: 'song not found' })

    return data.songs.map((song) => createSongPayload(song))
  }
}
