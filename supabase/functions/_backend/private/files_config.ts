import { getRuntimeKey } from 'hono/adapter'
import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { useCors } from '../utils/hono.ts'

export const app = new Hono()

app.use('/', useCors)

app.get('/', (c: Context) => {
  if (getRuntimeKey() !== 'workerd') {
    // Partial and TUS upload are only available on workerd
    return c.json({
      partialUpload: false,
      partialUploadForced: false,
      TUSUpload: false,
      TUSUploadForced: false,
    })
  }
  try {
    // force partial and tus for 20% of the requests
    const randomPU = Math.random()
    const randomTUS = Math.random()
    const forcePartialUpload = randomPU < 0.2
    const forceTUSUpload = randomTUS < 0.2
    return c.json({
      partialUpload: forcePartialUpload,
      partialUploadForced: true,
      TUSUpload: forceTUSUpload,
      TUSUploadForced: true,
    })
  }
  catch (e) {
    return c.json({ status: 'Cannot get files config', error: JSON.stringify(e) }, 500)
  }
})