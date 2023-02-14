
/***** IMPORTS *****/

import * as BASE58 from 'std/encoding/base58.ts'


/***** TYPES *****/

type HashOptions = Partial<{
    algorithm: Parameters<typeof crypto.subtle.digest>[0]
    truncateToLength: number
}>


/***** MAIN *****/

async function hashString(input: string, options?: HashOptions) {
    const byteArray     = new TextEncoder().encode(input)
    const hashByteArray = await crypto.subtle.digest(options?.algorithm ?? 'SHA-512', byteArray)
    const fullHash      = BASE58.encode(hashByteArray)
    const truncatedHash = fullHash.substring(0, options?.truncateToLength ?? 32)
    return truncatedHash
}


/***** EXPORTS *****/

export { hashString, type HashOptions }
