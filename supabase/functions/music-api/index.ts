import app from './server.ts'

Deno.serve(app.fetch)
