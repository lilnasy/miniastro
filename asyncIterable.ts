
/***** MAIN *****/

function map<A, B>(
    iterable: AsyncIterable<A>,
    mapFunction: (item: A) => B | Promise<B>
): AsyncIterable<Awaited<B>> {
    const iterator = iterable[Symbol.asyncIterator]()
    return {
        [Symbol.asyncIterator]() {
            return {
                async next() {
                    const next = await iterator.next()
                    if (next.done === true) return next
                    return { ...next, value: await mapFunction(next.value) }
                }
            }
        }
    }
}

function filter<A>(
    iterable: AsyncIterable<A>,
    filterFunction: (item: A) => boolean | Promise<boolean>
): AsyncIterable<A> {
    const iterator = iterable[Symbol.asyncIterator]()
    return {
        [Symbol.asyncIterator]() {
            return {
                async next() {
                    return await filterResult(iterator, filterFunction)
                }
            }
        }
    }
}

async function toArray<A>(iterable: AsyncIterable<A>): Promise<Array<Awaited<A>>>
async function toArray<A, B>(iterable: AsyncIterable<A>, mapFunction: (input: A) => B): Promise<Array<Awaited<B>>>
async function toArray<A>(
    iterable: AsyncIterable<A>,
    mapFunction: (input: A) => any = identity
): Promise<any[]> {
    const result = [] as Array<any>
    for await (const item of map(iterable, mapFunction)) result.push(item)
    return result
}


/***** HELPER FUNCTIONS *****/

function identity<T>(input: T) {
    return input
}

async function filterResult<A>(
    iterator: AsyncIterator<A>,
    filterFunction: (input: A) => boolean | Promise<boolean>
): Promise<IteratorResult<A>> {
    const next = await iterator.next()
    if (next.done === true) return next
    const matchesCondition = filterFunction(next.value)
    if (matchesCondition === true) return next
    if (matchesCondition instanceof Promise) {
        if (await matchesCondition) return next
    }
    return filterResult(iterator, filterFunction)
}


/***** EXPORTS *****/

export { map, filter, toArray }
