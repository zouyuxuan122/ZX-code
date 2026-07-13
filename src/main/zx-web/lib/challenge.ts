// @ts-nocheck
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export class DeepSeekHash {
  public wasmInstance: any
  private offset: number = 0
  private cachedUint8Memory: Uint8Array | null = null
  private cachedTextEncoder: TextEncoder = new TextEncoder()

  private encodeString(
    text: string,
    allocate: (size: number, align: number) => number,
    reallocate?: (ptr: number, oldSize: number, newSize: number, align: number) => number
  ): number {
    if (!reallocate) {
      const encoded = this.cachedTextEncoder.encode(text)
      const ptr = allocate(encoded.length, 1) >>> 0
      const memory = this.getCachedUint8Memory()
      memory.subarray(ptr, ptr + encoded.length).set(encoded)
      this.offset = encoded.length
      return ptr
    }

    const strLength = text.length
    let ptr = allocate(strLength, 1) >>> 0
    const memory = this.getCachedUint8Memory()
    let asciiLength = 0

    for (; asciiLength < strLength; asciiLength++) {
      const charCode = text.charCodeAt(asciiLength)
      if (charCode > 127) break
      memory[ptr + asciiLength] = charCode
    }

    if (asciiLength !== strLength) {
      if (asciiLength > 0) {
        text = text.slice(asciiLength)
      }
      
      ptr = reallocate(ptr, strLength, asciiLength + text.length * 3, 1) >>> 0
      
      const result = this.cachedTextEncoder.encodeInto(
        text,
        this.getCachedUint8Memory().subarray(ptr + asciiLength, ptr + asciiLength + text.length * 3)
      )
      asciiLength += result.written
      
      ptr = reallocate(ptr, asciiLength + text.length * 3, asciiLength, 1) >>> 0
    }

    this.offset = asciiLength
    return ptr
  }

  private getCachedUint8Memory(): Uint8Array {
    if (this.cachedUint8Memory === null || this.cachedUint8Memory.byteLength === 0) {
      this.cachedUint8Memory = new Uint8Array(this.wasmInstance.memory.buffer)
    }
    return this.cachedUint8Memory
  }

  public calculateHash(
    algorithm: string,
    challenge: string,
    salt: string,
    difficulty: number,
    expireAt: number
  ): number | undefined {
    if (algorithm !== 'DeepSeekHashV1') {
      throw new Error('Unsupported algorithm: ' + algorithm)
    }

    const prefix = `${salt}_${expireAt}_`

    try {
      const retptr = this.wasmInstance.__wbindgen_add_to_stack_pointer(-16)

      const ptr0 = this.encodeString(
        challenge,
        this.wasmInstance.__wbindgen_export_0,
        this.wasmInstance.__wbindgen_export_1
      )
      const len0 = this.offset

      const ptr1 = this.encodeString(
        prefix,
        this.wasmInstance.__wbindgen_export_0,
        this.wasmInstance.__wbindgen_export_1
      )
      const len1 = this.offset

      this.wasmInstance.wasm_solve(retptr, ptr0, len0, ptr1, len1, difficulty)

      const dataView = new DataView(this.wasmInstance.memory.buffer)
      const status = dataView.getInt32(retptr + 0, true)
      const value = dataView.getFloat64(retptr + 8, true)

      if (status === 0)
        return undefined

      return value

    } finally {
      this.wasmInstance.__wbindgen_add_to_stack_pointer(16)
    }
  }

  public async init(wasmPath: string): Promise<any> {
    const imports = { wbg: {} }
    const wasmBuffer = await fs.promises.readFile(wasmPath)
    const { instance } = await WebAssembly.instantiate(wasmBuffer, imports)
    this.wasmInstance = instance.exports
    console.log('[DeepSeekHash] WASM exports keys:', Object.keys(this.wasmInstance || {}))
    console.log('[DeepSeekHash] __wbindgen_add_to_stack_pointer exists:', typeof this.wasmInstance?.__wbindgen_add_to_stack_pointer)
    return this.wasmInstance
  }
}

let deepSeekHashInstance: DeepSeekHash | null = null

export async function getDeepSeekHash(): Promise<DeepSeekHash> {
  if (!deepSeekHashInstance || !deepSeekHashInstance.wasmInstance) {
    deepSeekHashInstance = new DeepSeekHash()
    const wasmFilename = 'sha3_wasm_bg.7b9ca65ddd.wasm'

    // 尝试所有候选路径（不依赖 app.isPackaged，因为 dev 模式下行为不稳定）
    const candidates = [
      path.join(process.resourcesPath, 'wasm', wasmFilename),
      path.join(process.cwd(), 'resources', 'wasm', wasmFilename),
      path.join(app.getAppPath(), 'resources', 'wasm', wasmFilename),
      path.resolve(app.getAppPath(), '..', '..', 'resources', 'wasm', wasmFilename),
      path.join(__dirname, '..', '..', '..', 'resources', 'wasm', wasmFilename),
    ]

    console.log('[DeepSeekHash] __dirname:', __dirname)
    console.log('[DeepSeekHash] app.getAppPath():', app.getAppPath())
    console.log('[DeepSeekHash] process.cwd():', process.cwd())
    console.log('[DeepSeekHash] process.resourcesPath:', process.resourcesPath)

    let wasmPath: string = ''
    for (const candidate of candidates) {
      const exists = fs.existsSync(candidate)
      console.log('[DeepSeekHash] candidate:', candidate, 'exists:', exists)
      if (exists) {
        wasmPath = candidate
        break
      }
    }

    if (!wasmPath) {
      console.error('[DeepSeekHash] WASM file not found in any candidate path')
      throw new Error('WASM file not found: ' + wasmFilename)
    }

    console.log('[DeepSeekHash] Using WASM path:', wasmPath)
    try {
      await deepSeekHashInstance.init(wasmPath)
      console.log('[DeepSeekHash] WASM initialized successfully')
    } catch (error) {
      console.error('[DeepSeekHash] WASM initialization failed:', error)
      deepSeekHashInstance = null
      throw error
    }
  }
  return deepSeekHashInstance
}

export default DeepSeekHash
