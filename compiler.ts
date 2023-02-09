
/***** IMPORTS *****/

import * as Compiler from 'astro-compiler'
import * as SWC      from './swc.ts'
import { hash }      from './hash.ts'


/***** TYPES *****/

type CompileResult = Awaited<ReturnType<typeof compileAstro>>


/***** CONSTANTS *****/

const astroImportSpecifiers = /(?<=^\s*import\s+[\w$]+\s+from\s+['"]).+astro(?=['"]\s*;?\s*?$)/mg
const cssImports            = /^import ".+\?astro&type=style&index=\d+&lang.css";$/mg

const wasmURL = 'https://unpkg.com/browse/@astrojs/compiler@1.1.0/astro.wasm'


/***** MAIN *****/

async function compileAstro(astroFileContent: string) {
    
    await Compiler.initialize({ wasmURL })
    
    const { code: _code, scripts: _scripts, ..._metadata } = await Compiler.transform(astroFileContent, {
        resolvePath: _ => Promise.resolve('/sada/das'),
        internalURL: 'https://esm.sh/astro@2.0.9/runtime/server?target=es2022'
    })
    
    const importedModules = Array.from(_code.match(astroImportSpecifiers) ?? [])
    
    const code = _code
                 // remove css imports from astro compiler's result
                 .replaceAll(cssImports, '')
                 // add .ts extension to astro imports
                 .replaceAll(astroImportSpecifiers, s => s + '.ts')

    const scripts = await Promise.all(_scripts.map(async script => {
        if (script.type === 'external') throw new Error('external scripts are not supported', { cause: script })
        const _hash  = await hash(script.code, { truncateToLength: 8 })
        const result = await compileTypescript(script.code)
        return { hash: _hash, code: result }
    }))
    
    const metadata = { ..._metadata, importedModules, scripts }
    
    return { code, metadata }
}

async function compileTypescript(input: string) {
    const { code } = await SWC.transform(input, {
        jsc: {
            target: 'es2022',
            parser: {
                syntax: 'typescript',
                decorators: true
            }
        }
    })
    return code
}


/***** EXPORTS *****/

export { compileAstro as compile, type CompileResult }
