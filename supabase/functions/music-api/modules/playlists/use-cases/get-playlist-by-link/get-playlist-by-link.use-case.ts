import { Endpoints } from '#common/constants/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createPlaylistPayload } from '#modules/playlists/helpers/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'
import type { PlaylistAPIResponseModel, PlaylistModel } from '#modules/playlists/models/index.ts'
import type { z } from 'zod'

export interface GetPlaylistByLinkArgs {
  token: string
  limit: number
  page: number
}

export class GetPlaylistByLinkUseCase implements IUseCase<GetPlaylistByLinkArgs, z.infer<typeof PlaylistModel>> {
  constructor() {}

  async execute({ token, limit, page }: GetPlaylistByLinkArgs) {
    const { data } = await useFetch<z.infer<typeof PlaylistAPIResponseModel>>({
      endpoint: Endpoints.albums.link,
      params: {
        token,
        n: limit,
        p: page,
        type: 'playlist'
      }
    })

    if (!data) throw new HTTPException(404, { message: 'playlist not found' })

    const playlist = createPlaylistPayload(data)

    return {
      ...playlist,
      songCount: playlist?.songs?.length || null,
      songs: playlist?.songs?.slice(0, limit) || []
    }
  }
}
