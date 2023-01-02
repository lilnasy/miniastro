
/***** IMPORTS *****/

import { createResult } from 'https://esm.sh/astro@1.8.0/dist/core/render/result?target=es2022'
import { renderPage }   from 'https://esm.sh/astro@1.8.0/dist/runtime/server/render/page?target=es2022'


/***** TYPES *****/

type Route = {
    module: Parameters<typeof renderPage>[1],
    inlineStylesheet: string,
    linkedScripts: Array<string>,
    pattern: URLPattern
}


/***** MAIN *****/

function createRouter(routes: Array<Route>) {
    return (request: Request) => {
        const url = new URL(request.url)
        const match = routes.find(({ pattern }) => pattern.test(url))
        if (match === undefined) return new Response('', { status: 404 })
        const patternParams = match.pattern.exec(url)!.pathname.groups
        return renderAstro(request, match.module, patternParams, match.inlineStylesheet)
    }
}

function renderAstro(
    request: Request,
    component: Route['module'],
    patternParams: Record<string, string>,
    inlineStylesheet: string
) {
    
    const url = new URL(request.url)
    
    const searchParams = Object.fromEntries(url.searchParams)
       
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
        resolve     : x => (console.info('createresult resolve called', x), Promise.resolve(x)),
        
        origin      : url.origin,
        pathname    : url.pathname,
        request,
        status      : 200,
        
        styles      : new Set([ { props: {}, children: inlineStylesheet } ]),
        
        params      : { ...patternParams, ...searchParams },
        props       : {}
    })
    
    const response = renderPage(result, component, undefined, undefined, true)
    
    return response
}


/***** EXPORTS *****/

export { createRouter, type Route }
