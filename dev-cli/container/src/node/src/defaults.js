export const DEFAULT_MODULE_FORMAT_TAG = { name: 'Module-Format', value: 'wasm64-unknown-emscripten-draft_2024_02_15' }
export const DEFAULT_INPUT_ENCODING_TAG = { name: 'Input-Encoding', value: 'JSON-1' }
export const DEFAULT_OUTPUT_ENCODING_TAG = { name: 'Output-Encoding', value: 'JSON-1' }
export const DEFAULT_VARIANT_TAG = { name: 'Variant', value: 'ao.TN.1' }
export const DEFAULT_MEMORY_LIMIT_TAG = {name: 'Memory-Limit', value: '1-gb' }
export const DEFAULT_COMPUTE_LIMIT_TAG = {name: 'Compute-Limit', value: '9000000000000' }

export const DEFAULT_BUNDLER_HOST = process.env.AO_LOCALNET? 
  'http://host.docker.internal:4007': 
  'https://up.arweave.net';

export const AoModuleTags = [
  { name: 'Data-Protocol', value: 'ao' },
  { name: 'Type', value: 'Module' },
  DEFAULT_MODULE_FORMAT_TAG,
  DEFAULT_INPUT_ENCODING_TAG,
  DEFAULT_OUTPUT_ENCODING_TAG,
  DEFAULT_VARIANT_TAG,
  DEFAULT_MEMORY_LIMIT_TAG,
  DEFAULT_COMPUTE_LIMIT_TAG,
  { name: 'Content-Type', value: 'application/wasm' }
]
