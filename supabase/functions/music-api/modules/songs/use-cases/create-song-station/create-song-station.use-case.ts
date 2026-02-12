import { Endpoints } from '#common/constants/index.ts'
import { ApiContextEnum } from '#common/enums/index.ts'
import { useFetch } from '#common/helpers/index.ts'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types/index.ts'

export class CreateSongStationUseCase implements IUseCase<string, string> {
  constructor() {}

  async execute(songId: string) {
    const encodedSongId = JSON.stringify([encodeURIComponent(songId)])

    const { data, ok } = await useFetch<{ stationid: string }>({
      endpoint: Endpoints.songs.station,
      params: {
        entity_id: encodedSongId,
        entity_type: 'queue'
      },
      context: ApiContextEnum.ANDROID
    })

    if (!data || !ok || !data.stationid) throw new HTTPException(500, { message: 'could not create station' })

    return data.stationid
  }
}
