import { SongAPIResponseModel, SongModel } from '#modules/songs/models/index.ts'
import { z } from 'zod'

export const SearchSongAPIResponseModel = z.object({
  total: z.number(),
  start: z.number(),
  results: z.array(SongAPIResponseModel)
})

export const SearchSongModel = z.object({
  total: z.number(),
  start: z.number(),
  results: z.array(SongModel)
})
