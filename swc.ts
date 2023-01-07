import { decompress } from "https://deno.land/x/lz4@v0.1.2/mod.ts";
import type {
  Config,
  ParseOptions,
  Program,
} from "https://esm.sh/@swc/core@1.2.212/types.d.ts";
import { instantiate } from "https://deno.land/x/swc@0.2.1/lib/deno_swc.generated.js";


export async function parse(source: string, opts: ParseOptions): Promise<Program> {
	const { parseSync } = await instantiate(decompress);
	return parseSync(source, opts);
}

export async function print(program: Program, opts?: Config): Promise<{ code: string }> {
	const { printSync } = await instantiate(decompress);
	return printSync(program, opts || {});
}

export async function transform(source: string, opts: Config): Promise<{ code: string }> {
	const { transformSync } = await instantiate(decompress);
	return transformSync(source, opts);
}
