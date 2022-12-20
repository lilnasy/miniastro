
/***** IMPORTS *****/

import { createResult } from 'https://esm.sh/astro@1.6.14/dist/core/render/result?target=es2022'
import { renderPage }   from 'https://esm.sh/astro@1.6.14/dist/runtime/server/render/page?target=es2022'


/***** TYPES *****/

type AstroModule = {
    component: Parameters<typeof renderPage>[1]
    name: string,
    styles: Array<string>
    scripts: Array<string>
}


/***** MAIN *****/

function createRouter(modules: Array<AstroModule>) {
    const map = new Map(modules.map(m => [`/${m.name.toLowerCase()}`, m]))
    return (request: Request) => {
        const url = new URL(request.url)
        const maybeRoute = map.get(url.pathname)
        if (maybeRoute === undefined) return new Response('', { status: 404 })
        return renderAstro(request, maybeRoute)
    }
}

function renderAstro(request: Request, astroModule: AstroModule) {
    
    const url = new URL(request.url)
    
    const result = createResult({
        adapterName : undefined,
        logging     : {
                        level: 'warn',
                        dest: { write: logMessage => (console.warn(logMessage), true) }
                      },
        markdown    : {},
        mode        : 'development',
        site        : undefined,
        ssr         : true,
        renderers   : [],
        resolve     : Promise.resolve,
        
        origin      : url.origin,
        pathname    : url.pathname,
        request,
        status      : 200,
        
        styles      : new Set([ toSSRElement(astroModule.styles) ]),
        
        params      : Object.fromEntries(new URL(request.url).searchParams),
        props       : {}
    })
    
    const response = renderPage(result, astroModule.component, undefined, undefined, true)
    
    return response
}


/***** HELPER FUNCTIONS *****/

function toSSRElement(styles: string[]) {
    const uniqueStyles = Array.from(new Set(styles))
    const children = uniqueStyles.join('')
    return { props: {}, children }
}


/***** EXPORTS *****/

export { createRouter }
