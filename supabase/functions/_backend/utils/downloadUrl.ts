import type { Context } from '@hono/hono'
import type { Database } from './supabase.types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { s3 } from './s3.ts'
import { supabaseAdmin } from './supabase.ts'

const EXPIRATION_SECONDS = 604800
const BASE_PATH = 'files/read/attachments'

export interface ManifestEntry {
  file_name: string | null
  file_hash: string | null
  download_url: string | null
}

export function getPathFromVersion(ownerOrg: string, appId: string, bucketId: string | null, storageProvider: string, r2Path: string | null) {
  if (storageProvider === 'r2' && r2Path)
    return r2Path
  else if (storageProvider === 'r2' && bucketId && bucketId?.endsWith('.zip'))
    return `apps/${ownerOrg}/${appId}/versions/${bucketId}`
}

export async function getBundleUrl(
  c: Context,
  ownerOrg: string,
  version: {
    id: Database['public']['Tables']['app_versions']['Row']['id']
    storage_provider: Database['public']['Tables']['app_versions']['Row']['storage_provider']
    r2_path: Database['public']['Tables']['app_versions']['Row']['r2_path']
    bucket_id: Database['public']['Tables']['app_versions']['Row']['bucket_id']
    app_id: Database['public']['Tables']['app_versions']['Row']['app_id']
  },
) {
  console.log({ requestId: c.get('requestId'), context: 'getBundleUrlV2 version', version })

  const path = getPathFromVersion(ownerOrg, version.app_id, version.bucket_id, version.storage_provider, version.r2_path)

  const { data: bundleMeta } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .select('size, checksum')
    .eq('id', version.id)
    .single()

  console.log({ requestId: c.get('requestId'), context: 'path', path })
  if (!path)
    return null

  if (getRuntimeKey() !== 'workerd') {
    try {
      const signedUrl = await s3.getSignedUrl(c, path, EXPIRATION_SECONDS)
      console.log({ requestId: c.get('requestId'), context: 'getBundleUrl', signedUrl, size: bundleMeta?.size })

      const url = signedUrl

      return { url, size: bundleMeta?.size }
    }
    catch (error) {
      console.error({ requestId: c.get('requestId'), context: 'getBundleUrl', error })
    }
  }

  const url = new URL(c.req.url)
  const downloadUrl = `${url.protocol}//${url.host}/${BASE_PATH}/${path}?key=${bundleMeta?.checksum}`
  return { url: downloadUrl, size: bundleMeta?.size }
}

export async function getManifestUrl(c: Context, version: {
  id: Database['public']['Tables']['app_versions']['Row']['id']
  storage_provider: Database['public']['Tables']['app_versions']['Row']['storage_provider']
  r2_path: Database['public']['Tables']['app_versions']['Row']['r2_path']
  bucket_id: Database['public']['Tables']['app_versions']['Row']['bucket_id']
  app_id: Database['public']['Tables']['app_versions']['Row']['app_id']
  manifest: Database['public']['CompositeTypes']['manifest_entry'][] | null
}): Promise<ManifestEntry[]> {
  if (!version.manifest) {
    return []
  }

  try {
    const url = new URL(c.req.url)
    const signKey = version.id

    return version.manifest.map((entry) => {
      if (!entry.s3_path)
        return null

      // Make sure s3_path is url safe untill CLI is fixed TODO: remove in january 2025
      // if safeS3Path start and end with " remove them
      const safeS3PathQuotes = entry.s3_path.startsWith('"') && entry.s3_path.endsWith('"') ? entry.s3_path.slice(1, -1) : entry.s3_path
      const fileNameQuotes = entry.file_name?.startsWith('"') && entry.file_name?.endsWith('"') ? entry.file_name.slice(1, -1) : entry.file_name

      return {
        file_name: fileNameQuotes,
        file_hash: entry.file_hash,
        download_url: `${url.protocol}//${url.host}/${BASE_PATH}/${safeS3PathQuotes}?key=${signKey}`,
      }
    }).filter(entry => entry !== null) as ManifestEntry[]
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'getManifestUrl', error })
    return []
  }
}
