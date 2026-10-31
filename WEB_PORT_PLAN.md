# Mario Kart Wii → WebAssembly + WebGPU: Feasibility Report

*Written 2026-10-26. Based on Wiicompiled `af5a45e` (v0.9.3), aurora fork `457903b`, and the working native NTSC-U build.
Target browser: Brave 1.98.60 (Chromium 156) on Windows x64, Ryzen 5 5600X, RX 7600.*

## TL;DR

**Technically plausible, but a multi-week engineering project with real risk, not a recompile with a different compiler.**
The translated game code is plain, portable C++ and should compile to wasm unchanged. The problems are in the runtime and in aurora. Three things were built around native-OS features the browser doesn't have:

1. **Memory traps.** Guest memory relies on page-protection faults.
2. **Fibers.** Guest threads are libco fibers that switch C stacks.
3. **Blocking GPU readbacks.** The renderer waits synchronously for GPU results.

Each has a credible workaround, described below. None is proven.

My honest estimate:
- **"Boots, shows the title screen":** likely (~70%) with a few weeks of focused work.
- **"Menus work with keyboard":** likely once the title screen works (~60%).
- **"A race is playable":** possible (~45%). Rendering-correctness bugs and audio are the risk.
- **"Performance acceptable" (steady 60 fps):** uncertain (~30–40%). Wasm plus the checked-memory path plus single-threaded GX could be 2–3× slower than native. Native already needs an i5-8400-class CPU.

## What's in the codebase

| Part | Size | Notes |
|---|---|---|
| Translated game code (`BuildWorkspace/generated`) | ~7.8 M lines C++ in 108 shards (423 MB). Largest function ~34k lines. | Generated locally from your DOL/REL. Plain C++ with `goto`, using a `CpuContext*`. |
| Runtime (`runtime/src`, `include`) | ~55k lines C++ | HLE for OS, GX, audio (AX/DSP), DVD, NAND, input, Wiimote, network. Vendors libco, Crypto++, toml11, pugixml. |
| aurora (graphics/window/input) | Large C++ library | GX → **WebGPU**, using Google **Dawn** natively (D3D12 here). Shaders are **WGSL**. Window, input and audio go through **SDL3**. |
| Native deps | Dawn, SDL3, abseil, freetype, imgui, zstd, zlib-ng, sqlite, libusb, cppwinrt, tracy | Some are Windows/desktop-only (see below). |

## Area by area

### 1. Translated game code — **compiles as-is (expected)**
- It's portable C++: all memory access goes through `MemoryInline::*` helpers in runtime headers, and indirect calls go through a generated dispatch table (wasm `call_indirect` handles that fine).
- Function sizes are within browser engine limits.
- Changing how memory works means editing **runtime headers**, not the 7.8M generated lines.
- Compile time: native took about 2 minutes. emcc should be similar per file, but **linking and `wasm-opt` on a ~80–150 MB module will be slow and RAM-hungry**. We may need to skip or limit `wasm-opt`.

### 2. Memory model — **blocker, workaround exists**
- Native reserves a **flat 4 GiB guest space at a fixed host address (16 TiB)**. It uses Windows `VirtualAlloc2`/`MapViewOfFile3` to alias the same RAM into two views, and catches **access-violation faults** for:
  - MMIO
  - deferred EFB reads
  - the executable-write guard
  - wild pointers
- Wasm has no page protection, no fault handlers, no memory aliasing, and no fixed addresses.
- **Workaround:** the runtime already has a **checked access path** (`GuestFlat::RequiresCheckedAccess()` → `Memory::Read32` and friends), built for AArch64 kernels with large pages where page traps can't work. For wasm we force it on at compile time and back MEM1 (24 MB) and MEM2 (64–128 MB) with ordinary linear memory.
  - The translator's proven-RAM fast path (`FlatWriteRam*`) needs a wasm version that writes directly into linear memory with an address mask that folds the cached/uncached mirrors (`0x8…`/`0xC…`, `0x9…`/`0xD…`) onto one copy.
- **Memory size:** guest RAM plus aurora caches plus generated data should fit in **wasm32 (≤4 GB)**. Memory64 isn't needed and would be slower.
- **Cost:** every non-RAM-proven access becomes a function call or branch, which is a measurable slowdown.

### 3. Threads — **mostly fine, one hard piece**
- **Guest threads are cooperative fibers (libco)**, so game logic is effectively single-threaded. That's good news.
- But libco switches **native C stacks**, and wasm can't do that directly. Options, in order of preference:
  - **(a) One pthread per guest thread, handing off a baton** (exactly one runs at a time, which keeps the cooperative semantics exact). Needs SharedArrayBuffer, so the server must send COOP/COEP headers. Guest thread count is small. Each switch costs a futex wake (tens of µs). Unknown whether switch frequency makes that too slow.
  - **(b) JSPI-based stack switching** (Chromium 137+, so Brave 156 has it). Cleaner, but less mature, and its interaction with deep call stacks in generated code is unknown.
  - **(c) Emscripten Asyncify fibers.** Probably **not viable**: Asyncify would instrument 7.8M lines (large code growth, very slow builds).
- **Host threads** (GX worker, AX mixer, VI timing, network, Wiimote, log pumps): the GX worker and the AX mixer **already support inline/single-threaded mode** (`[video] gx_worker`, and an inline mixing fallback). We'd run them inline at first and drop Wiimote, Bluetooth and network.
- **The main loop blocks** (precise sleeps for VI pacing). That's not allowed on the browser main thread, so the game must run **in a Web Worker** (Emscripten `PROXY_TO_PTHREAD`) and render to an **OffscreenCanvas**.

### 4. Graphics (aurora) — **substantial porting, best part is it's already WebGPU**
- aurora already speaks the **WebGPU API** (Dawn's `wgpu::` C++ API) and generates **WGSL**, which is exactly what browsers take. Emscripten's **`emdawnwebgpu`** port provides the same `webgpu_cpp.h` API backed by the browser. That's the biggest reason this is plausible at all.
- **This aurora fork has no Emscripten support**: no `__EMSCRIPTEN__` code paths and no CMake for it. (Upstream aurora isn't confirmed either.) Work needed:
  - Remove `dawn::native` instance setup, toggles, validation levels, and the D3D12/Vulkan backend selection in `lib/webgpu/gpu.cpp`.
  - Feature gating. The browser exposes `dual-source-blending`, `timestamp-query` and BC compression on desktop, but each needs checking.
  - **Blocking readbacks:** `TimedWaitAny` and synchronous waits in `frame.cpp`, `depth_peek.cpp`, `color_peek.cpp` and `readback/gpu.cpp`. These are used for EFB peeks, which MKW uses for some effects. In the browser these must become async (one frame late) or use JSPI. A one-frame-late readback may cause visual glitches but shouldn't affect game logic.
  - Drop native-only extras: MetalFX, shared-texture interop, the Tracy profiler, the sqlite shader cache (or move it to IndexedDB).
- WebGPU inside a worker plus OffscreenCanvas plus SDL3's Emscripten backend together is a **known risk area** (input events arrive on the main thread and have to be forwarded to the worker).

### 5. File I/O — **solvable, keeps game data separate**
- DVD reads come from an extracted folder (`[paths] dvd_root`, mapping `files/` and `sys/`). About 2.6 GB is too big to preload into memory.
- **Plan:** the localhost server serves `D:\mkw-web\game\extracted` read-only. Because the game runs in a worker, Emscripten **WASMFS fetch-backed (lazy) files** or synchronous XHR can read them on demand.
- **NAND saves and Config.toml:** use the WASMFS **OPFS** backend so saves survive reloads.
- **Caveat on "no Nintendo files in the code":**
  - *Separable:* the runtime/aurora source and the web shell contain no Nintendo material, and assets load from your local folder at runtime.
  - *Not separable:* the compiled game module **is** a translation of the game's executable, exactly like the native `WiiCompiled.exe`. It also currently embeds the DOL/REL data sections. So the `.wasm` must be treated like game data: local only, gitignored, never uploaded.
  - We can move the embedded data sections to load from `main.dol`/`StaticR.rel` at runtime, but the translated code itself stays derived from the game.

### 6. Audio — **moderate risk**
- AX/DSP mixing is HLE in C++ and is portable. Output goes through SDL3, which uses Web Audio on Emscripten.
- Risks:
  - Crackle or latency from producing audio in a worker while Web Audio runs on the main thread or in an AudioWorklet.
  - The browser autoplay policy needs a click to start audio.
- Plan to feed an AudioWorklet through a SharedArrayBuffer ring buffer if SDL's path stutters.
- Drop music ducking (it uses WinRT media controls).

### 7. Input — **low risk**
- Keyboard → GameCube pad mapping already exists (`input_bindings`, Dolphin-style expressions), and SDL3 on Emscripten provides keyboard and Gamepad API input.
- Keyboard-only menus should work once events reach the worker.
- Drop the F10 imgui overlay at first; optional later.

### 8. Things to stub out on web
Wiimote/Bluetooth, the libusb GC adapter, Discord presence, network/WFC (SSL, sockets), WinRT music ducking, cppwinrt, crash-handler/SEH code, and Windows-specific timer and log-pipe code.
The Linux (POSIX) build path is the better starting point than Windows.

## Proposed approach (if you give the go-ahead)

Separate build tree; the upstream repo is not modified in place. All work goes on a local branch that is never pushed.

1. **Toolchain:** install emsdk (pinned recent version), with `emdawnwebgpu` and the SDL3 port.
2. **Runtime web profile:**
   - CMake `MKW_PLATFORM_WEB`.
   - Forced checked memory plus the wasm RAM fast path.
   - Pthread-baton fibers in place of libco.
   - GX worker and AX mixer inline.
   - Stubs for everything in section 8.
3. **aurora web backend:** an `__EMSCRIPTEN__` path in `gpu.cpp`, async readbacks, feature gating, and OffscreenCanvas plus SDL3 in a worker.
4. **Build:** reuse the already-generated shards from the native install. No re-translation should be needed; the translator emits target-neutral C++.
5. **Server:** a small Node or Python server bound to **127.0.0.1:3000** only.
   - Sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
   - Serves `/game/` read-only from `D:\mkw-web\game\extracted`.
6. **Milestones** (I'll report each one plainly, including if one stalls):
   1. **Boots:** the module loads, the runtime initialises, WebGPU gets an adapter, and the DOL constructors run (comparable to the native log).
   2. **Title screen** renders.
   3. **Menus** work with the keyboard.
   4. **Race** is playable.
   5. **Performance:** measure FPS. Optimisation candidates are the GX worker on a real pthread, SIMD, and cutting checked-memory overhead.

**Effort:** roughly 2–4 weeks of focused sessions to reach "title screen", and longer to reach a polished race. Expect several dead ends along the way, most likely around fibers or WebGPU in a worker.

## Kill criteria (when I'd tell you to stop)
- Pthread-baton fiber switching is too slow, **and** JSPI fails on this code. Then there's no way to run guest threads.
- The linked wasm module won't build or load: link-time memory, browser compile limits, or the per-module size limit.
- WebGPU-in-worker plus SDL3 can't be made to present frames in Brave without rewriting aurora's window layer.
- Measured speed after boot is well under 30 fps with no clear hotspot to fix.
