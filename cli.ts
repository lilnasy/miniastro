
/***** IMPORTS *****/

import { match, P } from 'ts-pattern'
import {
    buildInCWD,
    buildAndRun
} from './main.ts'


/***** MAIN *****/

match(Deno.args)
.with(['build', P.select()], buildInCWD)
.with(['run'  , P.select()], buildAndRun)
.otherwise(x => console.info("Your arguments don't match any pattern", x))
