
/***** IMPORTS *****/

import * as BASE64 from 'std/encoding/base64.ts'


/***** TYPES *****/

type HashOptions = Partial<{
    algorithm: Parameters<typeof crypto.subtle.digest>[0]
    truncateToLength: number
}>


/***** MAIN *****/

async function hash(input: string, options?: HashOptions) {
    const byteArray     = new TextEncoder().encode(input)
    const hashByteArray = await crypto.subtle.digest(options?.algorithm ?? 'SHA-512', byteArray)
    const fullHash      = BASE64.encode(hashByteArray)
    const truncatedHash = fullHash.substring(0, options?.truncateToLength ?? 32)
    return truncatedHash
}


/***** EXPORTS *****/

export { hash, type HashOptions }
