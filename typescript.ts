
/***** IMPORTS *****/

// @deno-types="swc-web-types"
import * as SWC       from 'swc-web'
import { hashString } from './hash.ts'


/***** TYPES *****/

type TsCompileResult      = Awaited<ReturnType<typeof compileTypescript>>
type TsParseImportsResult = Awaited<ReturnType<typeof parseTsImports>>


/***** CONSTANTS *****/

const swcWasmPath = import.meta.resolve('swc-web-wasm')
const cache       = await caches.open('miniastro')


/***** MUTABLE STATE *****/

let swcLoaded = false


/***** MAIN *****/

async function cachedCompileTypescript(
    input: string,
    sourceFileName?: string
): Promise<TsCompileResult> {
    
    const start   = performance.now()
    const hash    = await hashString(input)
    const request = new Request(`https://ts.compiler/${hash}`)

    const maybeCached = await cache.match(request)
    if (maybeCached !== undefined) {
        console.info(`loaded ${ sourceFileName ?? 'typescript file'} from cache: ${ performance.now() - start }ms`)
        return await maybeCached.json()
    }

    const startCompile = performance.now()
    const result       = await compileTypescript(input)
    console.info(`compiled ${ sourceFileName ?? 'typescript file'}: ${ performance.now() - startCompile }ms`)
    const response = new Response(JSON.stringify(result))

    cache.put(request, response)

    return result
}

async function compileTypescript(input: string) {

    const loading = loadSwcIfNeeded()
    if (loading instanceof Promise) await loading

    const { code } = await SWC.transform(input, { 
        jsc: {
            target: 'es2022',
            parser: {
                syntax: 'typescript',
                decorators: true
            },
        }
    }).catch(e => {
        throw new Error('SWC failed to tranform source code: ' + e, { cause: input })
    })
    
    return code
}

async function cachedParseTsImports (input: string, sourceFileName?: string): Promise<TsParseImportsResult> {
    const start   = performance.now()
    const hash    = await hashString(input)
    const request = new Request(`https://ts.parser/${hash}`)

    const maybeCached = await cache.match(request)
    if (maybeCached !== undefined) {
        console.info(`loaded ${ sourceFileName ?? 'typescript file'} imports from cache: ${ performance.now() - start }ms`)
        return await maybeCached.json()
    }

    const startParse = performance.now()
    const result     = await parseTsImports(input)
    console.info(`parsed  ${ sourceFileName ?? 'typescript file'} imports: ${ performance.now() - startParse }ms`)
    const response = new Response(JSON.stringify(result))

    cache.put(request, response)

    return result
}

async function parseTsImports (input: string) {

    const loading = loadSwcIfNeeded()
    if (loading instanceof Promise) await loading

    const ast = await SWC.parse(input, { syntax: 'typescript', decorators: true }).catch(e => {
        throw new Error('SWC failed to parse input: ' + e, { cause: input })
    })

    const importedModules = ast.body.flatMap(x => x.type !== 'ImportDeclaration' ? [] : [{
        specifier : x.source.value,
        span  : {
            // adjusted so that .substring or .slice returns the specifier without quotes
            start : x.source.span.start,
            end   : x.source.span.end - 2
        }
    }])

    return importedModules
}


/***** HELPER FUNCTIONS ******/

function loadSwcIfNeeded() {
    if (swcLoaded === true) return 'ok'
    console.time('SWC loaded')
    return SWC.default(swcWasmPath).catch(e => {
        throw new Error('SWC failed to load: ' + e)
    }).then(() => {
        console.timeEnd('SWC loaded')
        swcLoaded = true
        return 'ok' as const
    })
}

/***** EXPORTS *****/

export {
    cachedCompileTypescript as compileTypescript,
    cachedParseTsImports as parseTsImports,
    type TsCompileResult,
    type TsParseImportsResult
}
