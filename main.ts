
/***** IMPORTS *****/

import * as asyncIterable from './asyncIterable.ts'
import { compile }        from './cachedCompiler.ts'
import { join }           from 'https://deno.land/std@0.170.0/path/mod.ts'
import { match, P }       from 'https://github.com/lilnasy/ts-pattern/raw/main/src/index.ts'


/***** CONSTANTS *****/

// might be an issue that only a single space worth of whitespace is allowed
// between 'from' and the file specifier
const regexForAstroImports = /(?<=^import.+from ['"]).+astro(?=['"];?\s?$)/mg


/***** MAIN *****/

match(Deno.args)
.with(['build', P.select()], build)
.with(['run'  , P.select()], run)
.otherwise(() => console.info('Your arguments don\'t match any pattern'))


/***** ACTIONS *****/

async function build(sourceDir: string) {
    const routesDir = Deno.readDir(sourceDir)
    const entrypoint = await createEntrypoint(routesDir)
    await mkdirWriteFile('.miniastro/main.ts', entrypoint)
    await resolveSpecifiers('.miniastro/main.ts', sourceDir)
}

async function run(sourceDir: string) {
    const routesDir      = Deno.readDir(sourceDir)
    const entrypoint     = await createEntrypoint(routesDir)
    const tempDir        = await Deno.makeTempDir({ prefix: 'miniastro' })
    const entrypointPath = join(tempDir, 'main.ts')
    await mkdirWriteFile(entrypointPath, entrypoint)
    await resolveSpecifiers(entrypointPath, sourceDir)
    const server = Deno.run({ cmd: [ "deno", "run", "-A", entrypointPath ] })
    await server.status()
}


/***** PROCEDURES *****/

function mkdirWriteFile(path: string, content: string) {
    return Deno.writeTextFile(path, content)
            .catch(async _ => {
                const splitPath = path.split('/')
                await Deno.mkdir(splitPath.slice(0, splitPath.length - 1).join('/'))
                return Deno.writeTextFile(path, content)
            })
}

async function resolveSpecifiers(currentFilePath: string, routesDir: string) {
    const currentFile = await Deno.readTextFile(currentFilePath)
    const importFileNames = currentFile.match(regexForAstroImports)
    
    if (importFileNames === null) return
    
    const rewritingImports = importFileNames.map(async name => {
        const sourceFilePath = join(Deno.cwd(), routesDir, name)
        const targetFilePath = join(currentFilePath, '..', name) + '.ts'
        console.log({ sourceFilePath, targetFilePath })
        const astroFile      = await Deno.readTextFile(sourceFilePath)
        const tsFile         = await compile(astroFile)
        await mkdirWriteFile(targetFilePath, tsFile)
        await resolveSpecifiers(targetFilePath, routesDir)
    })
    
    await Promise.all(rewritingImports)
    
    const rewrittenSpecifiers =
        currentFile.replace(regexForAstroImports, fileSpecifier => fileSpecifier + '.ts')
    
    await Deno.writeTextFile(currentFilePath, rewrittenSpecifiers)
}

// TODO recursively scan the folder
// TODO home page
async function createEntrypoint(routesDir: AsyncIterable<Deno.DirEntry>) {
    
    const astroFileEntries = asyncIterable.filter(routesDir, entry => entry.isFile && entry.name.endsWith('.astro'))
    const fileNames = await asyncIterable.toArray(astroFileEntries, entry => entry.name)
    
    const serverImport = `import { serve } from 'https://deno.land/std@0.170.0/http/server.ts'`
    const routerImport = `import { createRouter } from '${import.meta.resolve('./runtime.ts')}'`
    
    const importStatements =
        fileNames
        .map(fileName => [moduleName(fileName), fileName])
        .map(([m, f]) => `import ${m}, { scripts as ${m}_scripts, styles as ${m}_styles } from './${f}'`)
    
    const moduleNames = fileNames.map(moduleName)
    
    const routes = moduleNames.map(m => `{ name: '${m}', component: ${m}, styles: ${m}_styles, scripts: ${m}_scripts }`)
    
    return [
        serverImport,
        routerImport,
        importStatements.join('\n'),
        '',
        `const routes = [\n\t${routes.join(',\n\t')}\n]`,
        '',
        'const router = createRouter(routes)',
        '',
        'serve(router)',
        ''
    ].join('\n')
}


/***** HELPER FUNCTIONS *****/

function moduleName(fileName: string) {
    return fileName[0].toUpperCase() + fileName.substring(1, fileName.indexOf('.'))
}

function notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined
}
