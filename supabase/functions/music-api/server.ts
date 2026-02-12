import { AlbumController, ArtistController, SearchController, SongController } from '#modules/index.ts'
import { PlaylistController } from '#modules/playlists/controllers/index.ts'
import { App } from './app.ts'

const app = new App([
  new SearchController(),
  new SongController(),
  new AlbumController(),
  new ArtistController(),
  new PlaylistController()
]).getApp()

export default app
