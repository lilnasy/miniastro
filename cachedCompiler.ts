
/***** IMPORTS *****/

import { hash as createHash } from './hash.ts'
import { compile as uncachedCompile, type CompileResult } from './compiler.ts'


/***** CONSTANTS *****/

const cache = await caches.open('miniastro')


/***** MAIN *****/

async function compile(astroFileContent: string): Promise<CompileResult> {
    
    const hash    = await createHash(astroFileContent)
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
