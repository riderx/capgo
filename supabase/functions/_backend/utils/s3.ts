import type { Context } from '@hono/hono'
import type { Database } from '../utils/supabase.types.ts'
import { S3Client } from '@bradenmacdonald/s3-lite-client'
import { getEnv } from './utils.ts'

export function initS3(c: Context) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const useSsl = getEnv(c, 'S3_SSL') !== 'false'
  const storageRegion = getEnv(c, 'S3_REGION')

  console.log({ requestId: c.get('requestId'), context: 'initS3' })

  return new S3Client({
    endPoint: storageEndpoint,
    port: undefined,
    useSSL: useSsl,
    accessKey: access_key_id,
    secretKey: access_key_secret,
    region: storageRegion ?? 'us-east-1',
    bucket: getEnv(c, 'S3_BUCKET'),
    pathStyle: storageEndpoint !== '127.0.0.1:54321/storage/v1/s3',
  })
}

export async function getPath(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  if (!record.r2_path) {
    console.log({ requestId: c.get('requestId'), context: 'no r2_path' })
    return null
  }
  if (!record.r2_path && (!record.app_id || !record.user_id || !record.id)) {
    console.log({ requestId: c.get('requestId'), context: 'no app_id or user_id or id' })
    return null
  }
  const exist = await checkIfExist(c, record.r2_path)
  if (!exist) {
    console.log({ requestId: c.get('requestId'), context: 'not exist', vPath: record.r2_path })
    return null
  }
  return record.r2_path
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 1200) {
  const client = initS3(c)
  return client.presignedGetObject(fileId, { expirySeconds })
}

async function deleteObject(c: Context, fileId: string) {
  const client = initS3(c)
  await client.deleteObject(fileId)
  return true
}

async function checkIfExist(c: Context, fileId: string | null) {
  if (!fileId) {
    return false
  }
  const client = initS3(c)
  try {
    await client.statObject(fileId)
    return true
  }
  catch (error) {
    console.log({ requestId: c.get('requestId'), context: 'checkIfExist', fileId, error })
    return false
  }
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initS3(c)
  return client.presignedGetObject(fileId, { expirySeconds })
}

async function getSize(c: Context, fileId: string) {
  const client = initS3(c)
  try {
    const stat = await client.statObject(fileId)
    return stat.size
  }
  catch (error) {
    console.log({ requestId: c.get('requestId'), context: 'getSize', error })
    return 0
  }
}

export const s3 = {
  getSize,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
