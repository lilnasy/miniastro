
/***** IMPORTS *****/

import { crypto } from 'https://deno.land/std@0.170.0/crypto/mod.ts'
import * as BASE64 from 'https://deno.land/std@0.170.0/encoding/base64.ts'
import { compile as uncachedCompile } from './compiler.ts'


/***** CONSTANTS *****/

const cache = await caches.open('miniastro') 


/***** MAIN *****/

async function compile(astroFileContent: string) {
    
    // TODO reconsider hashing
    // is it really worth adding 2 dependencies
    // maybe 'btoa' is adequate
    // benchmark on text sizes ranging from 1kb to 100kb
    // test if requests with paths that long are viable
    // test if on-disk file descriptors that long are viable
    const hash = BASE64.encode(await crypto.subtle.digest('BLAKE3', new TextEncoder().encode(astroFileContent)))
    const request = new Request(`http://module.astro/${hash}`)
    
    const maybeCached = await cache.match(request)
    if (maybeCached !== undefined) return maybeCached.text()
    
    const result = await uncachedCompile(astroFileContent)
    const response = new Response(result)
    
    cache.put(request, response)
    
    return result
}


/***** EXPORTS *****/

export { compile }
