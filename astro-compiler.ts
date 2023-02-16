
/***** IMPORTS *****/

import * as Compiler  from 'astro-compiler'
import { hashString } from './hash.ts'
import ImportMap      from './deno.json' assert { type: 'json' }


/***** TYPES *****/

type AstroCompileResult   = Awaited<ReturnType<typeof compileAstro>>


/***** CONSTANTS *****/

const astroImportSpecifiers = /(?<=^\s*import\s+[\w$]+\s+from\s+['"]).+astro(?=['"]\s*;?\s*?$)/mg
const cssImports            = /^import ".+\?astro&type=style&index=\d+&lang.css";$/mg
const astroWasmPath         = import.meta.resolve('astro-compiler-wasm')
const cache                 = await caches.open('miniastro')


/***** MUTABLE STATE *****/

let astroCompilerLoaded = false


/***** MAIN *****/

async function cachedCompileAstro(
    astroFileContent: string,
    sourceFileName?: string
): Promise<AstroCompileResult> {
    
    const start   = performance.now()
    const hash    = await hashString(astroFileContent)
    const request = new Request(`https://astro.compiler/${hash}`)

    const maybeCached = await cache.match(request)
    if (maybeCached !== undefined) {
        console.log(`loaded ${ sourceFileName ?? 'astro file'} from cache: ${ performance.now() - start }ms`)
        return await maybeCached.json()
    }
    
    const startCompile = performance.now()
    const result       = await compileAstro(astroFileContent)
    console.log(`compiled ${ sourceFileName ?? 'astro file'}: ${ performance.now() - startCompile }ms`)
    const response     = new Response(JSON.stringify(result))
    
    cache.put(request, response)
    
    return result
}

async function compileAstro(astroFileContent: string) {
    
    const loading = loadAstroIfNeeded()
    if (loading instanceof Promise) await loading
    
    const { code: _code, ..._metadata } = await Compiler.transform(astroFileContent, {
        resolvePath: _ => Promise.resolve('/sada/das'),
        internalURL: ImportMap.imports['astro/'] + 'runtime/server?target=es2022'
    })
    
    const importedModules = Array.from(_code.match(astroImportSpecifiers) ?? [])
    
    const code = _code
                 // remove css imports from astro compiler's result
                 .replaceAll(cssImports, '')
                 // add .ts extension to astro imports
                 .replaceAll(astroImportSpecifiers, s => s + '.ts')
    
    return { ..._metadata, code, importedModules }
}


/***** HELPER FUNCTIONS ******/

function loadAstroIfNeeded() {
    if (astroCompilerLoaded === true) return 'ok'
    console.time('Astro compiler loaded')
    return loadAstro(astroWasmPath).then(() => {
        console.timeEnd('Astro compiler loaded')
        astroCompilerLoaded = true
        return 'ok' as const
    })
}

async function loadAstro(wasmUrl: string) {
    
    const request     = new Request(wasmUrl)
    const maybeCached = await cache.match(request)
    
    if (maybeCached !== undefined) {
        const blob = await maybeCached.blob()
        const url  = URL.createObjectURL(blob)

        return Compiler.initialize({ wasmURL: url }).catch(e => {
            throw new Error('Astro compiler failed to load: ' + e)
        })
    }
    
    const response = await fetch(wasmUrl)

    cache.put(request, response.clone())

    const blob     = await response.blob()
    const url      = URL.createObjectURL(blob)
    
    return Compiler.initialize({ wasmURL: url }).catch(e => {
        throw new Error('Astro compiler failed to load: ' + e)
    })

}
    

/***** EXPORTS *****/

export {
    cachedCompileAstro as compileAstro,
    type AstroCompileResult
}
