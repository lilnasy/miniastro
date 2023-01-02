
/***** IMPORTS *****/

import * as asyncIterable             from './asyncIterable.ts'
import { compile }                    from './cachedCompiler.ts'
import { join, relative, isAbsolute } from 'https://deno.land/std@0.170.0/path/mod.ts'
import { match, P }                   from 'https://github.com/lilnasy/ts-pattern/raw/main/src/index.ts'


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

    const sourceEntries    = Deno.readDir(pagesDir)
    const astroFileEntries = asyncIterable.filter(sourceEntries, entry => entry.isFile && entry.name.endsWith('.astro'))
    const astroFilePaths   = await asyncIterable.toArray(astroFileEntries, entry => entry.name)
    
    const compilations = astroFilePaths.map(astroFileName => ({
        sourceAstroFilePath: join(Deno.cwd(), pagesDir, astroFileName),
        targetTsFilePath   : join(targetDir, 'pages', astroFileName) + '.ts'
    }))
    
    const _routes = compilations.map(async c => {
        const { styles, scriptPaths } = await buildTarget({ compilations: [c] })
        const moduleSpecifier = relative(targetDir, c.targetTsFilePath).replaceAll('\\', '/')
        const inlineStylesheet = Array.from(styles).join(' ')
        const linkedScripts = Array.from(scriptPaths).map(x => '/' + relative(join(c.targetTsFilePath, '..'), x).replaceAll('\\', '/'))
        return { moduleSpecifier, inlineStylesheet, linkedScripts } satisfies Route
    })
    
    const routes = await Promise.all(_routes)
    
    const entrypointPath = join(targetDir, 'server.ts')
    const entrypointContents = createEntrypoint(routes)
    
    await mkdirWriteFile(entrypointPath, entrypointContents)
    return entrypointPath
}


/***** PROCEDURES *****/

function createEntrypoint(routes: Array<Route>) {
    
    if (routes.find(({ moduleSpecifier }) => isAbsolute(moduleSpecifier)) !== undefined) throw new Error('Absolute module specifier provided to `createEntrypoint`', { cause: routes.find(({ moduleSpecifier }) => isAbsolute(moduleSpecifier)) })

    const importStatements =
        routes.map(({ moduleSpecifier }) => `import ${ moduleName(moduleSpecifier) } from './${ moduleSpecifier }'`)
    
    const routeEntries = routes.map(({ moduleSpecifier, inlineStylesheet, linkedScripts }) => `{ \
module: ${ moduleName(moduleSpecifier) }, \
inlineStylesheet: \`${ escape(inlineStylesheet) }\`, \
linkedScripts: [ ${ linkedScripts.map(link => "`" + link + "`").join(', ') } ], \
pattern: ${ pattern(moduleSpecifier) } \
}`)
    
    return `\
import { serve } from "https://deno.land/std@0.170.0/http/server.ts"
import { createRouter } from "${ import.meta.resolve('./runtime.ts') }"

${ importStatements.join('\n') }

const routes = [\n\t${ routeEntries.join(',\n\t') }\n]

const router = createRouter(routes)

serve(router)
`
}

type BuildTargetParameters = {
    compilations: Array<Compilation>
    styles?: Set<string>
    scriptPaths?: Set<string>
}

async function buildTarget(
    {
        compilations,
        styles = new Set<string>,
        scriptPaths = new Set<string>
    }: BuildTargetParameters
): Promise<{ styles: typeof styles, scriptPaths: typeof scriptPaths }> {

    const [compilation, ...remaingingCompilations] = compilations
    
    if (compilation === undefined) return { styles, scriptPaths }
    
    const { sourceAstroFilePath, targetTsFilePath } = compilation
    
    if (isAbsolute(sourceAstroFilePath) === false) throw new Error('Relative source path provided to `buildTarget`', { cause: sourceAstroFilePath })
    if (isAbsolute(targetTsFilePath) === false) throw new Error('Relative target path provided to `buildTarget`', { cause: targetTsFilePath })
    
    const astroFile          = await Deno.readTextFile(sourceAstroFilePath)
    const { code, metadata } = await compile(astroFile)
    
    const writingFile = mkdirWriteFile(targetTsFilePath, code)
    
    const _jsPaths = metadata.scripts.map(async ({ hash, code }) => {
        const clientSideJsFilePath = join(targetTsFilePath, '..', hash) + '.js'
        await Deno.writeTextFile(clientSideJsFilePath, code)
        return clientSideJsFilePath
    })
    
    const jsPaths = await Promise.all(_jsPaths)
    
    metadata.css.forEach(style => styles.add(style))
    jsPaths.forEach(path => scriptPaths.add(path))
    
    const moreCompilations = metadata.importedModules.map(relativeAstroPath => ({
        sourceAstroFilePath: join(sourceAstroFilePath, '..', relativeAstroPath),
        targetTsFilePath   : join(targetTsFilePath, '..', relativeAstroPath) + '.ts'
    }))
    
    await writingFile
    
    return buildTarget({
        compilations: [...remaingingCompilations, ...moreCompilations],
        styles,
        scriptPaths
    })
}


/***** HELPER FUNCTIONS *****/

function escape(value: string) {
	return value.replaceAll('`', '\\`').replaceAll('${', '\\${');
}

async function mkdirWriteFile(path: string, content: string) {
	const targetDir = join(path, '..')
    await Deno.mkdir(targetDir, { recursive: true })
    return await Deno.writeTextFile(path, content)
}

// TODO [param] -> :param
function pattern(astroFileName: string) {
    if (isAbsolute(astroFileName)) throw new Error('Absolute path provided to `pattern`', { cause: astroFileName })
    const path = astroFileName.replace('pages/', '').replace('.astro.ts', '')
    const expression = `new URLPattern({ pathname: '/${ path }' })`
    return expression
}

function moduleName(moduleSpecifier: string) {
    if (isAbsolute(moduleSpecifier)) throw new Error('Absolute path provided to `moduleName`', { cause: moduleSpecifier })
    const result = moduleSpecifier
                   .replaceAll('.astro.ts', '')
                   .replaceAll(/[\\/]./g, x => x.substring(1).toUpperCase())
                   .replaceAll('.', '')
    return uppercaseFirstLetter(result)
}

function uppercaseFirstLetter(input: string) {
    return input[0].toUpperCase() + input.substring(1)
}
