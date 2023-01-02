
/***** IMPORTS *****/

import * as BASE64 from 'https://deno.land/std@0.170.0/encoding/base64.ts'
import { compile as uncachedCompile, type CompileResult } from './compiler.ts'


/***** CONSTANTS *****/

const cache = await caches.open('miniastro') 


/***** MAIN *****/

async function compile(astroFileContent: string): Promise<CompileResult> {
    
    const hash = BASE64.encode(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(astroFileContent)))
    const request = new Request(`https://astro.compiler/${hash}`)
    
    const maybeCached = await cache.match(request)
    if (maybeCached !== undefined) return await maybeCached.json()
        
    const result = await uncachedCompile(astroFileContent)
    const response = new Response(JSON.stringify(result))
    
    cache.put(request, response)
    
    return result
}


/***** EXPORTS *****/

export { compile, type CompileResult }
