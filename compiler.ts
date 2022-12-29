
/***** IMPORTS *****/

import * as Compiler from 'https://esm.sh/@astrojs/compiler@0.31.0/browser?target=es2022'
import * as SWC      from 'https://github.com/littledivy/deno_swc/raw/14842f9/mod.ts'


/***** TYPES *****/

type ExternalScript = { type: 'external', src: string }
type InlineScript   = { type: 'inline', code: string, map: string }
type HoistedScript  = ExternalScript | InlineScript


/***** CONSTANTS *****/

const wasmURL = 'https://esm.sh/@astrojs/compiler@0.31.0/astro.wasm'


/***** MAIN *****/

async function compileAstro(astroFileContent: string) {
    
    await Compiler.initialize({ wasmURL })
    
    const { code, css, scripts } = await Compiler.transform(astroFileContent, {
        experimentalStaticExtraction: true,
        projectRoot: 'file://cas/sdasdaca',
        resolvePath: _ => Promise.resolve('/sadas/das/'),
        internalURL: 'https://esm.sh/astro@1.6.14/runtime/server?target=es2022'
    })
    
    // names of imported components
    const importedComponents = new Array<string>
    
    const newCode =
        code
        .split('\n')
        .map(line => {    
            if (line.endsWith('.css";')) return ''
            if (line.endsWith('.astro"') || line.endsWith(".astro'")) {
                
                const [_import, astroModule, _from, astroFilePath] = line.split(' ')
                
                importedComponents.push(astroModule)
                
                return `import ${ astroModule }, * as __${ astroModule } from ${astroFilePath}`
            }
            return line
        })
        .join('\n')
    
    // "...__importedComponentX.styles, ...__importedComponentY.styles, "
    const importedStyles = importedComponents.map(c => `...__${c}.styles`)
    
    const selfStyles = css.map(style => `\`${escape(style)}\``)
    
    // export const styles = [ ...__importedComponentX.styles, ...__importedComponentY.styles, 'css { from: currentComponent }' ]
    const exportCss = `export const styles  = [ ${ [...importedStyles, ...selfStyles].join(', ') } ]`
    
    // "...__importedComponentX.scripts, ...__importedComponentY.scripts, "
    const importedScripts = importedComponents.map(c => `...__${c}.scripts`)
    
    const selfScripts = scripts
                        .filter(isInline)
                        .map(script => compileTypescript(script.code))
                        .map(code => `\`${escape(code)}\``)
    
    // export const scripts = [ ...__importedComponentX.scripts, ...__importedComponentY.scripts, 'const code = "from current component"' ]
    const exportJs = `export const scripts = [ ${ [...importedScripts, ...selfScripts].join(', ') } ]`
    
    return [
        newCode,
        exportCss,
        exportJs
    ].join('\n')
}

function compileTypescript(input: string) {
    const { code } = SWC.transform(input, {
        jsc: {
            target: "es2022",
            parser: {
                syntax: "typescript",
                decorators: true
            }
        }
    })
    return code
}


/***** HELPER FUNCTIONS *****/

function escape(value: string) {
	return value.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function isInline(script: HoistedScript): script is InlineScript {
    return script.type === 'inline'
}


/***** EXPORTS *****/

export { compileAstro as compile }
