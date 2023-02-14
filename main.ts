
/***** IMPORTS *****/

import * as asyncIterable from './asyncIterable.ts'
import { hashString }     from './hash.ts'
import { compileAstro }   from './astro-compiler.ts'
import {
    compileTypescript,
    parseTsImports
}                         from './typescript.ts'
import {
    join,
    relative,
    isAbsolute
}                         from 'std/path/mod.ts'


/***** TYPES *****/

type Compilation = {
    sourceAstroFilePath : string
    targetTsFilePath    : string
}

type Route = {
    moduleSpecifier  : string
    inlineStylesheet : string
    linkedScripts    : Array<string>
}


/***** MAIN *****/

async function buildInCWD(pagesDir: string) {
    const targetDir = join(Deno.cwd(), '.miniastro')
    await build(pagesDir, targetDir)
}

async function buildAndRun(pagesDir: string) {
    const tempDir        = await Deno.makeTempDir({ prefix: 'miniastro' })
    const entrypointPath = await build(pagesDir, tempDir)
    const server         = Deno.run({ cmd: [ 'deno', 'run', '-A', entrypointPath ] })
    await server.status()
}


async function build(pagesDir: string, targetDir: string) {
    
    const fsTree         = await readDirNested(pagesDir)
    const astroFilePaths = fsTree.filter(path => path.endsWith('.astro'))
    
    const compilations = astroFilePaths.map(astroFilePath => ({
        sourceAstroFilePath: join(Deno.cwd(), pagesDir, astroFilePath),
        targetTsFilePath   : join(targetDir, 'pages', astroFilePath) + '.ts'
    }))
    
    const _routes = compilations.map(async c => {
        const { styles, scriptPaths } = await recursivelyCompileWriteAstroFiles([c])
        const moduleSpecifier  = relative(targetDir, c.targetTsFilePath).replaceAll('\\', '/')
        const inlineStylesheet = Array.from(new Set(styles)).join(' ')
        const linkedScripts    = Array.from(new Set(scriptPaths))
                                      .map(x => '/' + relative(join(c.targetTsFilePath, '..'), x)
                                      .replaceAll('\\', '/'))
        
        return { moduleSpecifier, inlineStylesheet, linkedScripts } satisfies Route
    })
    
    const routes = await Promise.all(_routes)
    
    const staticFiles = routes.reduce((filePaths, route) => [...filePaths, ...route.linkedScripts], new Array<string>)
    
    const runtimeContents    = await Deno.readTextFile(new URL(import.meta.resolve('./runtime.ts')))
    const newRuntimeContents = rewriteRuntimeImportSpecifiers(runtimeContents)
    const runtimePath        = join(targetDir, 'runtime.ts')
    await mkdirWriteFile(runtimePath, newRuntimeContents)

    const entrypointPath     = join(targetDir, 'server.ts')
    const entrypointContents = createEntrypoint(routes, staticFiles)
    
    await mkdirWriteFile(entrypointPath, entrypointContents)
    return entrypointPath
}


/***** PROCEDURES *****/

// runtime.ts is included in the final app but includes
// references to the import map which need to be replaced
// with their static urls
function rewriteRuntimeImportSpecifiers(runtimeContents: string) {
    const specifierRegEx     = /(?<=import.*(from\s+)?["'])(.*)(?=["'];?)/g
    const newRuntimeContents = runtimeContents.replaceAll(specifierRegEx, specifier => import.meta.resolve(specifier))
    return newRuntimeContents
}

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
import { createRouter } from "./runtime.ts"

${ importStatements.join('\n') }

const routes = [\n\t${ [...routeEntries, ...staticEntries].join(',\n\t') }\n]

const router = createRouter(routes)

serve(router)
`
}

async function recursivelyCompileWriteAstroFiles(
    compilations :    Array<Compilation>,
    styles      = new Array<string>,
    scriptPaths = new Array<string>
): Promise<{ styles: typeof styles, scriptPaths: typeof scriptPaths }> {

    const [compilation, ...remaingingCompilations] = compilations
    
    if (compilation === undefined) return { styles, scriptPaths }
    
    const { sourceAstroFilePath, targetTsFilePath } = compilation
    
    const astroFileContents = await Deno.readTextFile(sourceAstroFilePath)
    const { code, css: moreStyles, scripts, importedModules } = await compileAstro(astroFileContents, sourceAstroFilePath)
    
    const writingFile = mkdirWriteFile(targetTsFilePath, code)
    
    const __moreScriptPaths = scripts.map(async (script, index) => {
        assert(script.type !== 'external', 'external scripts are not supported', { cause: script })
        
        const hash       = await hashString(script.code, { truncateToLength: 8 })
        const sourcePath = `${sourceAstroFilePath}#inline-script${index > 0 ? '-' + (index + 1) : ''}`
        const targetPath = join(targetTsFilePath, '..', hash + '.js')
        
        const { code: _, writtenFiles } = await recursivelyCompileWriteTsFiles(script.code, sourcePath, targetPath)
        
        return writtenFiles
    })
    
    const _moreScriptPaths = await Promise.all(__moreScriptPaths)
    const moreScriptPaths  = _moreScriptPaths.flat()
    
    const moreCompilations = importedModules.map(relativeAstroPath => ({
        sourceAstroFilePath: join(sourceAstroFilePath, '..', relativeAstroPath),
        targetTsFilePath   : join(targetTsFilePath, '..', relativeAstroPath) + '.ts'
    }))
    
    await writingFile
    
    return recursivelyCompileWriteAstroFiles(
        [ ...remaingingCompilations, ...moreCompilations ],
        [ ...styles,                 ...moreStyles       ],
        [ ...scriptPaths,            ...moreScriptPaths  ]
    )
}

async function recursivelyCompileWriteTsFiles(
    code       : string,
    sourcePath : string,
    targetPath : string
): Promise<{ code: string, writtenFiles: Array<string> }> {
    // read the source file
    // parse to get all the imports
    // recursively parse, compile, and write the imported files first
    // replace the import specifier with the path of the written file
    // compile the current file
    // write it to disk
    const importedModules = await parseTsImports(code, sourcePath)

    const {
        code: newCode,
        writtenFiles
    } = await importedModules.reduce(async (acc, im) => {
        if (im.specifier.startsWith('./') !== true) return acc

        const sourcePath_     = join(sourcePath, '..', im.specifier)
        const _sourceContents = await Deno.readTextFile(sourcePath_)
        const hash            = await hashString(_sourceContents, { truncateToLength: 8 })
        
        const imSourcePath = join(sourcePath, '..', im.specifier)
        const imTargetPath = join(targetPath, '..', hash) + '.js'
        const { code: sourceFileContents, writtenFiles: writtenFiles_ }
            = await recursivelyCompileWriteTsFiles(_sourceContents, imSourcePath, imTargetPath)

        const targetFilePath     = join(targetPath, '..', hash) + '.js'
        const targetFileContents = await compileTypescript(sourceFileContents, sourcePath_)
        
        await Deno.writeTextFile(targetFilePath, targetFileContents)
        
        
        // target file path relative to the script that imports it
        const relativePath   = relative(join(targetPath, '..'), targetFilePath).replaceAll('\\', '/')
        
        const { code: _code, writtenFiles: writtenFiles__ } = await acc 
        const { start, end } = im.span
        const code           = _code.slice(0, start) + './' + relativePath + _code.slice(end)
        const writtenFiles   = [ ...writtenFiles_, ...writtenFiles__, targetFilePath ]
        const newAcc         = { code, writtenFiles }
        
        return newAcc
    }, Promise.resolve({ code, writtenFiles: new Array<string> }))

    const targetContents  = await compileTypescript(newCode, sourcePath)

    await Deno.writeTextFile(targetPath, targetContents)

    return { code: targetContents, writtenFiles: [ ...writtenFiles, targetPath ] }
}


/***** HELPER FUNCTIONS *****/

async function mkdirWriteFile(path: string, content: string) {
    const targetDir = join(path, '..')
    await Deno.mkdir(targetDir, { recursive: true })
    return await Deno.writeTextFile(path, content)
}

async function readDirNested(currentDir: string, relativePathToStart = ''): Promise<Array<string>> {
    
    const entries = await asyncIterable.toArray(Deno.readDir(currentDir))
    
    const directFilePaths = entries
                            .filter(entry => entry.isFile && entry.name.endsWith('.astro'))
                            .map(entry => join(relativePathToStart, entry.name))
    
    const subdirectories   = entries.filter(entry => entry.isDirectory)
    const _nestedFilePaths = subdirectories.map(({ name }) => readDirNested(join(currentDir, name), join(relativePathToStart, name)))
    const nestedFilePaths  = (await Promise.all(_nestedFilePaths)).flat()
    
    return [...directFilePaths, ...nestedFilePaths]
}

function pattern(astroFileName: string) {
    return astroFileName
           .replace('pages/', '/')
           .replace('.astro.ts', '')
           .replace(/index$/, '')
           // [param] -> :param
           .replaceAll(/\[\w+\]/g, x => ':' + x.slice(1, x.length - 1))
}

function moduleName(moduleSpecifier: string) {
    
    if (isAbsolute(moduleSpecifier)) throw new Error('Absolute path provided to `moduleName`', { cause: moduleSpecifier })
    
    const result = moduleSpecifier
                   .replace(/.astro.ts$/, '')
                   .replaceAll(/[\\/]./g, x => x.slice(1).toUpperCase())
                   .replaceAll('.', '')
                   .replaceAll(/\[\w+\]/g, x => '$' + x.slice(1, x.length - 1) + '$')
    
    const uppercaseFirstLetter = result[0].toUpperCase() + result.substring(1)

    return uppercaseFirstLetter
}

function assert(assertion: boolean, msg = "Assertion failed", cause?: unknown): asserts assertion {
    if (assertion === true) return
    else throw new Error(msg, { cause })
}


/***** EXPORTS *****/

export { buildInCWD, buildAndRun }
