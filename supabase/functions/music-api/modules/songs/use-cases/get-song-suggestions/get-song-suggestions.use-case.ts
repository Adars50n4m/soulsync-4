import { Endpoints } from '#common/constants/index.ts'
import { ApiContextEnum } from '#common/enums/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { createSongPayload } from '#modules/songs/helpers/index.ts'
import { CreateSongStationUseCase } from '#modules/songs/use-cases/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'
import type { SongModel, SongSuggestionAPIResponseModel } from '#modules/songs/models/index.ts'
import type { z } from 'zod'

export interface GetSongSuggestionsArgs {
  songId: string
  limit: number
}

export class GetSongSuggestionsUseCase implements IUseCase<GetSongSuggestionsArgs, z.infer<typeof SongModel>[]> {
  private readonly createSongStation: CreateSongStationUseCase

  constructor() {
    this.createSongStation = new CreateSongStationUseCase()
  }

  async execute({ songId, limit }: GetSongSuggestionsArgs) {
    const stationId = await this.createSongStation.execute(songId)

    const { data, ok } = await useFetch<z.infer<typeof SongSuggestionAPIResponseModel>>({
      endpoint: Endpoints.songs.suggestions,
      params: {
        stationid: stationId,
        k: limit
      },
      context: ApiContextEnum.ANDROID
    })

    if (!data || !ok) {
      throw new HTTPException(404, { message: `no suggestions found for the given song` })
    }

    const { stationid, ...suggestions } = data

    return (
      Object.values(suggestions)
        .map((element) => element && createSongPayload(element.song))
        .filter(Boolean)
        .slice(0, limit) || []
    )
  }
}
