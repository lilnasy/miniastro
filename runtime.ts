/***** IMPORTS *****/

import { extname }      from 'std/path/mod.ts'
import { contentType }  from 'std/media_types/content_type.ts'
import { createResult } from 'astro/dist/core/render/result?target=es2022'
import { renderPage }   from 'astro/dist/runtime/server/render/page?target=es2022'


/***** TYPES *****/

type StaticRoute = {
    type: 'static'
    pattern: string
    path: URL
}

type DynamicRoute = {
    type: 'dynamic'
    pattern: string
    module: Parameters<typeof renderPage>[1]
    inlineStylesheet: string
    linkedScripts: Array<string>
}

type Route = StaticRoute | DynamicRoute


/***** MAIN *****/

function createRouter(routes: Array<Route>) {
    
    const patterns = routes.map(r => [new URLPattern({ pathname: r.pattern }), r] satisfies [URLPattern, Route])
    
    return async (request: Request) => {
        
        const url = new URL(request.url)
        
        const match = patterns.find(([ pattern ]) => pattern.test(url))
        
        if (match === undefined) return new Response('', { status: 404 })
        
        const [pattern, route] = match
        
        if (route.type === 'static') {
            const { readable } = await Deno.open(route.path)
            const mimeType = contentType(extname(route.path.pathname))
            return new Response(readable, { headers: { 'Content-Type': mimeType ?? 'application/binary' } })
        }
        
        const patternParams = pattern.exec(url)!.pathname.groups
        
        return renderAstro(request, route, patternParams)
    }
}

function renderAstro(
    request: Request,
    { module, inlineStylesheet, linkedScripts }: DynamicRoute,
    patternParams: Record<string, string>
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
        
        scripts     : new Set(linkedScripts.map(src => ({ props: { src, type: 'module' }, children: '' }))),
        styles      : new Set([ { props: {}, children: inlineStylesheet } ]),
        
        params      : { ...patternParams, ...searchParams },
        props       : {}
    })
    
    const response = renderPage(result, module, undefined, undefined, true)
    
    return response
}


/***** EXPORTS *****/

export { createRouter }
export type { Route }
