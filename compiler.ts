
/***** IMPORTS *****/

import * as Compiler from 'https://esm.sh/@astrojs/compiler@0.31.0/browser?target=es2022'


/***** TYPES *****/

type ExternalScript = { type: 'external', src: string }
type InlineScript   = { type: 'inline', code: string, map: string }
type HoistedScript  = ExternalScript | InlineScript


/***** CONSTANTS *****/

const wasmURL = 'https://esm.sh/@astrojs/compiler@0.31.0/astro.wasm'


/***** MAIN *****/

async function compile(astroFileContent: string) {
    
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
                
                return `import ${astroModule}, { styles as ${astroModule + '_styles'}, scripts as ${astroModule + '_scripts'} } from ${astroFilePath}`
            }
            return line
        })
        .join('\n')
    
    const importedStyles = importedComponents.map(c => `${c}_styles`)
    
    // TODO escape style contents IMPORTANT!!
    const selfStyles     = css.map(style => `\`${style}\``)
    
    // export const styles = [ ...importedComponentX_styles, ...importedComponentY_styles, 'css { from: currentComponent }' ]
    const exportCss = [
        'export const styles  = [ ',
        importedStyles.map(s => `...${s}, `).join(''),
        selfStyles.join(', '),
        ']'
    ].join('')
    
    const importedScripts = importedComponents.map(c => `${c}_scripts`)
    
    // TODO elide types
    // TODO escape script.code contents IMPORTANT!!
    const selfScripts     = scripts.filter(isInline).map(script => `\`${script.code}\``)
    
    // export const scripts = [ ...importedComponentX_scripts, ...importedComponentY_scripts, 'const code: string = "from current component"' ]
    const exportJs = [
        'export const scripts = [ ',
        importedScripts.map(s => `...${s}, `).join(''),
        selfScripts.join(', '),
        ']'
    ].join('')
    
    return [
        newCode,
        exportCss,
        exportJs
    ].join('\n')
}


/***** HELPER FUNCTIONS *****/

function isInline(script: HoistedScript): script is InlineScript {
    return script.type === 'inline'
}


/***** EXPORTS *****/

export { compile }
