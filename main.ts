// TODO
// refactor so files are written only once at the end
// currently files are written then read from then written again
// -- refactor 'buildTarget' to not write to the file system directly
// -- only 'build' should write to the file system

/***** IMPORTS *****/

import * as asyncIterable from './asyncIterable.ts'
import { compile }        from './cachedCompiler.ts'
import { join, relative } from 'std/path/mod.ts'
import { match, P }       from 'ts-pattern'


/***** TYPES *****/

type Compilation = {
    sourceAstroFilePath : string
    targetTsFilePath    : string
}

type Route = {
    moduleSpecifier: string
    inlineStylesheet: string
    linkedScripts: Array<string>
}


/***** MAIN *****/

match(Deno.args)
.with(['build', P.select()], buildInCWD)
.with(['run'  , P.select()], buildAndRun)
.otherwise(x => console.info("Your arguments don't match any pattern", x))


/***** ACTIONS *****/

async function buildInCWD(pagesDir: string) {
    const targetDir = join(Deno.cwd(), '.miniastro')
    await build(pagesDir, targetDir)
}

async function buildAndRun(pagesDir: string) {
    const tempDir = await Deno.makeTempDir({ prefix: 'miniastro' })
    const entrypointPath = await build(pagesDir, tempDir)
    const server = Deno.run({ cmd: [ 'deno', 'run', '-A', entrypointPath ] })
    await server.status()
}


async function build(pagesDir: string, targetDir: string) {
    
    const fsTree         = await readDirThoroughly(pagesDir)
    const astroFilePaths = fsTree.filter(path => path.endsWith('.astro'))
    
    const compilations = astroFilePaths.map(astroFilePath => ({
        sourceAstroFilePath: join(Deno.cwd(), pagesDir, astroFilePath),
        targetTsFilePath   : join(targetDir, 'pages', astroFilePath) + '.ts'
    }))
    
    const _routes = compilations.map(async c => {
        const { styles, scriptPaths } = await buildTarget([c])
        const moduleSpecifier         = relative(targetDir, c.targetTsFilePath).replaceAll('\\', '/')
        const inlineStylesheet        = Array.from(new Set(styles)).join(' ')
        const linkedScripts           = Array.from(new Set(scriptPaths)).map(x => '/' + relative(join(c.targetTsFilePath, '..'), x).replaceAll('\\', '/'))
        return { moduleSpecifier, inlineStylesheet, linkedScripts } satisfies Route
    })
    
    const routes = await Promise.all(_routes)
    
    const staticFiles = routes.reduce((filePaths, route) => [...filePaths, ...route.linkedScripts], new Array<string>)
    
    const entrypointPath     = join(targetDir, 'server.ts')
    const entrypointContents = createEntrypoint(routes, staticFiles)
    
    await mkdirWriteFile(entrypointPath, entrypointContents)
    return entrypointPath
}


/***** PROCEDURES *****/

function createEntrypoint(routes: Array<Route>, staticFiles: Array<string>) {
        
    const importStatements =
        routes.map(({ moduleSpecifier }) => `import ${ moduleName(moduleSpecifier) } from './${ moduleSpecifier }'`)
    
    const routeEntries = routes.map(({ moduleSpecifier, inlineStylesheet, linkedScripts }) => `{ \
type: "dynamic", \
pattern: ${ JSON.stringify(pattern(moduleSpecifier)) }, \
module: ${ moduleName(moduleSpecifier) }, \
inlineStylesheet: ${ JSON.stringify(inlineStylesheet) }, \
linkedScripts: ${ JSON.stringify(linkedScripts) } \
}`)
    
    const staticEntries = staticFiles.map(path => `{ \
type: "static", \
pattern: ${ JSON.stringify(path) }, \
path: new URL(import.meta.resolve(${ JSON.stringify('./pages' + path) })) \
}`)
    
    return `\
import { serve } from "https://deno.land/std@0.171.0/http/server.ts"
import { createRouter } from "${ import.meta.resolve('./runtime.ts') }"

${ importStatements.join('\n') }

const routes = [\n\t${ [...routeEntries, ...staticEntries].join(',\n\t') }\n]

const router = createRouter(routes)

serve(router)
`
}

async function buildTarget(
        compilations: Array<Compilation>,
        styles = new Array<string>,
        scriptPaths = new Array<string>
): Promise<{ styles: typeof styles, scriptPaths: typeof scriptPaths }> {

    const [compilation, ...remaingingCompilations] = compilations
    
    if (compilation === undefined) return { styles, scriptPaths }
    
    const { sourceAstroFilePath, targetTsFilePath } = compilation
     
    const astroFile          = await Deno.readTextFile(sourceAstroFilePath)
    const { code, metadata } = await compile(astroFile)
    
    const writingFile = mkdirWriteFile(targetTsFilePath, code)
    
    const _compiledScriptPaths = metadata.scripts.map(async ({ hash, code }) => {
        const clientSideJsFilePath = join(targetTsFilePath, '..', hash) + '.js'
        await Deno.writeTextFile(clientSideJsFilePath, code)
        return clientSideJsFilePath
    })
    
    const compiledScriptPaths = await Promise.all(_compiledScriptPaths)
    
    const moreCompilations = metadata.importedModules.map(relativeAstroPath => ({
        sourceAstroFilePath: join(sourceAstroFilePath, '..', relativeAstroPath),
        targetTsFilePath   : join(targetTsFilePath, '..', relativeAstroPath) + '.ts'
    }))
    
    await writingFile
    
    return buildTarget(
        [...remaingingCompilations, ...moreCompilations],
        [...styles, ...metadata.css],
        [...scriptPaths, ...compiledScriptPaths]
    )
}


/***** HELPER FUNCTIONS *****/

async function mkdirWriteFile(path: string, content: string) {
    const targetDir = join(path, '..')
    await Deno.mkdir(targetDir, { recursive: true })
    return await Deno.writeTextFile(path, content)
}

async function readDirThoroughly(currentDir: string, relativePathToStart = ''): Promise<Array<string>> {
    
    const entries = await asyncIterable.toArray(Deno.readDir(currentDir))
    
    const directFilePaths = entries
                            .filter(entry => entry.isFile && entry.name.endsWith('.astro'))
                            .map(entry => join(relativePathToStart, entry.name))
    
    const subdirectories   = entries.filter(entry => entry.isDirectory)
    const _nestedFilePaths = subdirectories.map(({ name }) => readDirThoroughly(join(currentDir, name), join(relativePathToStart, name)))
    const nestedFilePaths  = (await Promise.all(_nestedFilePaths)).flat()
    
    return [...directFilePaths, ...nestedFilePaths]
}

function pattern(astroFileName: string) {
    return astroFileName
           .replace('pages/', '/')
           .replace('.astro.ts', '')
           // [param] -> :param
           .replaceAll(/\[\w+\]/g, x => ':' + x.slice(1, x.length - 1))
}

function moduleName(moduleSpecifier: string) {
    
    // if (isAbsolute(moduleSpecifier)) throw new Error('Absolute path provided to `moduleName`', { cause: moduleSpecifier })
    
    const result = moduleSpecifier
                   .replaceAll('.astro.ts', '')
                   .replaceAll(/[\\/]./g, x => x.slice(1).toUpperCase())
                   .replaceAll('.', '')
                   .replaceAll(/\[\w+\]/g, x => '$' + x.slice(1, x.length - 1) + '$')
    
    return uppercaseFirstLetter(result)
}

function uppercaseFirstLetter(input: string) {
    return input[0].toUpperCase() + input.substring(1)
}
