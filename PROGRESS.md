# MKW Web Port — Progress Log

## 2026-10-26 — Session 1: Setup checks (stopped on a region mismatch)

### Done
- Free disk space on C: was ~21.8 GB (of ~930 GB), which is tight. The README asks for ~20 GB during install.
  D: has ~856 GB free.
- Created `C:\mkw-web`.
- Cloned https://github.com/patchzyy/Wiicompiled to `C:\mkw-web\Wiicompiled` (HEAD `af5a45e`, v0.9.3+).
  The `aurora-main` submodule is not initialised yet.
- Read the README and `translator/README.md`, and skimmed `Launcher/` (the Setup tool, `LocalBuild.ps1` and `Prepare-PortableTools.ps1`).
- Inspected the game archive *without* extracting it:
  - `Mario Kart Wii.zip` is really a **7z** archive. Windows' `C:\Windows\System32\tar.exe` can read it.
  - It contains one file, `Mario Kart Wii (USA) (En,Fr,Es).nkit.iso` (2,713,321,472 bytes).
  - **Region: NTSC-U (game ID RMCE01), not PAL RMCP01.**
  - **Format: NKit ISO**, a scrubbed and shrunk image. It is not a plain 1:1 ISO.

### Findings
- The README says "PAL RMCP01 only", but the code has moved on: `projects/mkwii-ntsc-u/recomp.yml` exists,
  and the Setup tool's validation accepts every GameId listed in the payload manifest's `SupportedReleases`
  (RMCE01 appears there in its self-tests). So NTSC-U may well be supported now. That is not verified end to end.
- The NKit format is a separate risk. Setup reads the disc with `nodtool`, and NKit images are often not accepted as-is.
  We will probably need to restore it to a full ISO first, for example with the NKit tool.
- Toolchain status:
  - Present: Git 2.55, Python 3.14.
  - Missing: .NET 8 SDK (needed to build the translator and Setup).
  - Missing: CMake, Ninja and llvm-mingw. The project's own `Launcher/Prepare-PortableTools.ps1` downloads pinned, hash-checked builds of these.

### Not done (waiting on the user)
- The project folder has not been moved and nothing has been extracted, because the region differs from the expected PAL.
- Nothing has been installed.

## 2026-10-26 — Session 1 (cont.): User approved NTSC-U and moving to D:

### Done
- **Project now lives at `D:\mkw-web`.** `C:\mkw-web` was moved there and no longer exists.
- Copied the archive to `D:\mkw-web\game\Mario Kart Wii.7z`.
  - A move failed with "access denied". The original is still at `C:\Users\Light\OneDrive\Documents\mkw-web\Mario Kart Wii.zip`.
  - Delete that original by hand to free 2.3 GB on C:.
- Extracted `D:\mkw-web\game\Mario Kart Wii (USA) (En,Fr,Es).nkit.iso`.
- Ran `Launcher\Prepare-PortableTools.ps1`, which downloaded and hash-checked these into `Launcher\artifacts\portable-tools\`:
  - llvm-mingw 20260616
  - CMake 4.3.3
  - Ninja 1.13.2
- Downloaded nodtool v2.0.0-alpha.10 to `Launcher\artifacts\nodtool.exe`. It's the same file and location the project's `NodToolProvider.cs` uses.
  SHA-256: `1e150e33...948d`.
- Initialised the `aurora-main` submodule (`457903b`).
- **The NKit image works.** `nodtool info` reads it as a lossless ISO with game ID RMCE01, revision 0.
  - `nodtool extract` wrote everything to `D:\mkw-web\game\extracted` (2.6 GB).
  - `sys/main.dol` and `files/rel/StaticR.rel` **match the SHA-256 values in `projects/mkwii-ntsc-u/recomp.yml` exactly**, so no NKit restore is needed.
- The Wiicompiled `.gitignore` already excludes disc images, `*.dol`/`*.rel`/assets, `generated/`, builds and `Launcher/artifacts/`.
  Game data is kept in `D:\mkw-web\game`, outside the repo. Nothing has been or will be pushed.

## 2026-10-26 — Session 1 (cont.): Native build

### Done
- Installed the .NET 8 SDK 8.0.427 with winget, after the user approved the UAC prompt.
- **Build flow, matching the project's CI job in `.github/workflows/package.yml`:**
  1. Run `Launcher\Build-Installer.ps1 -VcRuntimeDirectory D:\mkw-web\vcredist`.
     - This fetches pinned dependencies (Dawn, SDL, abseil and others) into `Launcher\artifacts\dependencies`.
     - It precompiles aurora, the third-party libraries and the runtime into `native_prebuilt`.
     - It publishes the Setup and Translator, runs the payload copyright-boundary audit and the native dependency audit, and produces `Launcher\dist\WiiCompiled-Setup.exe` (374 MiB).
     - `D:\mkw-web\vcredist` holds only the VC++ CRT DLLs, copied from System32 because Visual Studio isn't installed.
     - **Don't pass System32 itself.** The script copies every `*.dll` in that folder, which broke the first run.
  2. Run `WiiCompiled-Setup.exe --silent --portable --progress-json --install-dir D:\mkw-web\native\WiiCompiled --game "<nkit.iso>"`.
     - This translates the game, compiles it with llvm-mingw (107 ninja steps), and installs it.
     - It reported success: version 0.9.3, NTSC-U DOL and REL hashes recorded.
- **Output:** `D:\mkw-web\native\WiiCompiled\Base\WiiCompiled.exe`.
  - User data (Config.toml, NAND, Logs) goes to `D:\mkw-web\native\UserData`.
  - Launch with `D:\mkw-web\native\WiiCompiled\WiiCompiled-Setup.exe --launch-base`, or run `Base\WiiCompiled.exe` directly.
- **First launch:** the run log (`UserData\Logs\base_*\console.log`) shows:
  - DOL and REL sections loaded and static constructors run.
  - aurora on D3D12, using the AMD RX 7600.
  - Repeated scene changes with THP video playback, which fits the boot, title and attract-mode loop.
  - No errors. A missing `wc24dl.vff` (WiiConnect24) is expected.
  - The process stayed responsive (about 2.2 GB RAM).
- Logs from this session: `D:\mkw-web\logs-*.txt`.

### Notes
- Portable mode still created a **Start Menu shortcut**: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\wiicompiled (base) (beta).lnk`. There's no Desktop shortcut and no uninstall registry entry.
- The user declined screen access for computer use, so the menus have **not** been checked by me. The user needs to confirm visually.

### Phase 1 complete
- The user confirmed the native build reaches the title screen and the menus work.

## 2026-10-26 — Phase 2, step 1: feasibility study

### Done
- Studied the runtime, the generated output, aurora, threading, memory, file I/O, audio and input.
- Wrote **`D:\mkw-web\WEB_PORT_PLAN.md`**.
- Key facts:
  - Generated code: ~7.8 M lines in 108 shards. Memory access goes through the runtime's `MemoryInline::*` helpers.
  - The checked memory path (`RequiresCheckedAccess`) exists. That's the way around the page-fault-based flat memory.
  - Guest threads are libco fibers, which is the hardest piece. Proposed: one pthread per guest thread with baton handoff, or JSPI as an alternative.
  - The GX worker and AX mixer can run inline.
  - aurora is WebGPU + WGSL already, but has no Emscripten code. Blocking readbacks need to become async.
  - Brave is 1.98.60 (Chromium 156): WebGPU, JSPI and Memory64 are available.
- Estimate: boots ~70%, playable race ~45%, 60 fps ~30–40%. Multi-week effort.

## 2026-10-26 — Phase 2: go-ahead given, working toward "boots"

### Done
- **emsdk** cloned to `D:\mkw-web\emsdk` (`d7b4130`): Emscripten 6.0.13 installed and activated.
  - Helper: `source /d/mkw-web/web/env.sh` (Git Bash) puts emcc/em++ on PATH.
- **Local branch `web-port`** in `D:\mkw-web\Wiicompiled`.
  - The push URL is set to `PUSH_DISABLED_local_only`, so an accidental `git push` fails.
  - Nothing is committed yet; all changes are in the working tree.
- **Generated game code compiles to wasm unchanged.** `web/smoke-all.sh` compiled all 91 base-game generated files with em++: **91 OK, 0 failed**. Objects are in `web/build-smoke/gen`, which is local only and holds game-derived output.
  - Flags: `-O2 -std=gnu++17 -fno-fast-math -ffp-contract=off -pthread -msimd128 -msse4.2`.
- **Runtime header changes** (all in `runtime/include`):
  - `isa/ppc_isa_config.h`: new `MKW_HOST_SSE` (x86-64 or Emscripten). Emscripten maps SSE4.2 intrinsics onto wasm SIMD.
  - `isa/ppc_isa_float.h` and `isa/ppc_isa_quantized.h`: the x86 branches now key on `MKW_HOST_SSE`. Without `-mfma` the exact scalar-FMA fallback is used.
  - `isa/ppc_isa_fpenv.h`: wasm gets a software-only FP control word. NI flush-to-zero isn't applied in hardware, a known small deviation that only affects denormals.
  - `guest_abi/flat_memory.h`: on wasm, `RequiresCheckedAccess()` is constant true and there's no flat base.
  - `guest_abi/memory_access.h`: on wasm, `FlatLoad`/`FlatStore` route to `Memory::Read*`/`Write*`. This is the correctness-first memory path; it may be optimised later.
- **CMake web mode:**
  - `runtime/CMakeLists.txt`: `MKW_PLATFORM_WEB` when `EMSCRIPTEN`; 32-bit pointers allowed only for Emscripten; `guest_flat_memory.cpp` excluded; no mbedTLS (no online play on web); new compile-only audit target `mkw_web_native_compile` (modelled on the macOS one).
  - `aurora-main/cmake/AuroraDawnProvider.cmake`: on Emscripten, `dawn::webgpu_dawn` comes from `--use-port=emdawnwebgpu`.
  - `aurora-main/cmake/AuroraSDL3Provider.cmake`: on Emscripten, SDL3 comes from `--use-port=sdl3`.
  - `web/configure-audit.sh` configures `web/build-audit` with the same pinned offline dependency sources as the native build.
- **Decision: target wasm32 first.** The page-table "bias" encoding is modular arithmetic, so 32-bit `uintptr_t` works. wasm64 (Memory64) is the fallback.

### Compile audit results (end of session 1)
- **All runtime sources compile for wasm** (`mkw_web_native_compile`; `audit4.log` is clean). Fixes made:
  - `runtime_config.h` and `main.cpp`: web graphics backend entry `{"auto"/"webgpu" → BACKEND_WEBGPU}`.
  - `hle/gx/gx_worker.cpp`: `struct alignas(16) Header`, because the pointer is 4 bytes on wasm32.
  - `host_context.cpp`: **new Emscripten backend.** Each guest context is a pthread, and a per-context semaphore baton lets exactly one run at a time. `Destroy` wakes the context and `pthread_exit`s it.
  - Runtime is compiled with **`-Dthread_local=`** on web, so all baton threads share runtime state like fibers on one host thread do. This only holds if no other host thread runs runtime code: the GX worker and AX mixer must run inline, and the remaining host threads must be checked at link time.
  - `src/platform/web/discord_presence_web.cpp` (no-op) and `network_ssl_web.cpp` (no TLS; SSL ioctls return -1) replace `discord_presence.cpp` and `network_ssl.cpp` on web.
- **aurora compiles for wasm except `lib/gx/pipeline.cpp`** (the `SetImmediates` issue below). Fixes made:
  - `WEBGPU_DAWN` is defined only for non-Emscripten builds (`aurora_core.cmake`, `aurora_gx.cmake`), which turns off the Dawn-native code paths.
  - `gpu.cpp`: the logging callback, `Device::Tick` and the Metal shared-texture features are behind `WEBGPU_DAWN`.
  - `texture_replacement.cpp`: `size_t` casts (32-bit `size_t`).
  - imgui: the WebGPU overlay renderer is left out on web; `lib/imgui.cpp` guards plus `AuroraDearImguiProvider.cmake`. **The F10 overlay doesn't render on web yet.**
  - `web/configure-audit.sh` now passes `-DBUILD_SHARED_LIBS=OFF` (zlib-ng had tried to build a `.so`).

### Known hard problems found (honest status)
1. **Immediate data (`var<immediate>`)**: aurora's GX shaders read a 64-byte per-draw block (vtx_start, current_pnmtx, fog_range_base, array_start0..2) through Dawn's immediate-data extension. emdawnwebgpu has no `SetImmediates`, so browser support can't be relied on. **Planned rework (web only):**
   - `shader.cpp`: emit `@group(1) @binding(1) var<uniform> imm: Immediate;` instead of `var<immediate>`.
   - `gfx/frame.cpp`: add binding 1 (uniform, dynamic offset, 64 bytes, pointing at the same uniform buffer) to the group-1 layout and bind group.
   - `command_processor.cpp`: `push_uniform(immediates)` per draw, storing its offset in `DrawData`.
   - `pipeline.cpp`: pass two dynamic offsets to `SetBindGroup(1, ...)`.
   - `gx.cpp`: `immediateSize = 0` on web.
   - Only `gx/pipeline.cpp` binds group 1.
2. **Blocking GPU waits:** `gpu.cpp` calls `WaitAny` with timeouts for the adapter request, device request and swapchain retire. The EFB/depth/color readback paths (`frame.cpp`, `depth_peek.cpp`, `color_peek.cpp`, `readback/gpu.cpp`) wait as well. In the browser, timed waits need JSPI or Asyncify, or the code must be restructured to be async. Whether JSPI works together with pthreads and `PROXY_TO_PTHREAD` here is **unverified**, and is the next big risk to test.
3. Guest memory web backend not written yet (`guest_flat_memory.cpp` is excluded on web, so linking will fail until it exists).

### Next (toward "boots")
1. Immediate-data rework (above), so all of aurora compiles.
2. `src/platform/web/guest_flat_memory_web.cpp`: implement the `GuestFlat` API with plain allocations for MEM1 (24 MB) and MEM2 (64/128 MB), feeding `Memory`'s page table. No fault handling.
3. Product link: `MKW_BUILD_PRODUCTS=ON` with the translated shards from `D:\mkw-web\native\WiiCompiled\BuildWorkspace\generated`.
   - Point `MKW_TRANSLATED_SHARD_MANIFEST` at them.
   - Link flags: `-pthread -sPROXY_TO_PTHREAD -sALLOW_MEMORY_GROWTH -sOFFSCREENCANVAS_SUPPORT`, exceptions (`-fwasm-exceptions`), and `-sJSPI` (to try).
   - Add `-Dthread_local=` to the product targets.
   - Force `[video] gx_worker = false` and inline AX mixing on web.
4. A small device-creation test page first (adapter, device, surface in a worker in Brave) to settle the WaitAny/JSPI question before the full game.
5. A localhost-only server on 127.0.0.1:3000 with COOP/COEP. It serves `/game/` read-only from `D:\mkw-web\game\extracted`; WASMFS fetch backend for DVD files, OPFS for NAND.

### Not committed
All changes (runtime + aurora submodule) are uncommitted working-tree edits on the local `web-port` branch. aurora's edits are inside the `aurora-main` submodule working tree.

## 2026-10-26 — Immediate-data rework done; GPU setup verified in Brave

### Immediate-data rework (aurora, web only)
- `gx.hpp` defines `AURORA_GX_UNIFORM_IMMEDIATES` when `__EMSCRIPTEN__`. Native builds are unchanged.
- `shader.cpp`: the immediate declaration is now the format placeholder `{12}`.
  - Web: `@group(1) @binding(1) var<uniform> imm: Immediate;`.
  - Native: `var<immediate> imm: Immediate;`, as before.
- `command_processor.cpp`: on web, `push_uniform(immediates)` per draw, with the offset stored in the new `DrawData::immediateUniformOffset` (`pipeline.hpp`).
- `pipeline.cpp`: on web, two dynamic offsets for group 1 and no `SetImmediates`.
- `gx.cpp`: `immediateSize` is omitted on web.
- `gfx/frame.cpp`: group-1 layout and bind group gain binding 1 (uniform, dynamic offset, 64 bytes, same uniform buffer).
- **Result: aurora_core/gx/pad/si/mtx/vi all compile for wasm** (`aurora4.log` is clean). The shader change isn't runtime-tested yet.

### GPU-setup probe (`web/gputest/gputest.cpp`)
- Built two variants with emdawnwebgpu and **JSPI**:
  - pthread: `-pthread -sPROXY_TO_PTHREAD -sOFFSCREENCANVAS_SUPPORT -sOFFSCREENCANVASES_TO_PTHREAD=#canvas`
  - main thread
- Tested in **Brave 1.98.60 (Chromium 156)**, using a separate profile at `D:\mkw-web\web\brave-profile`.
- Logs: `web/logs/probe-*.log`.
- **Both variants passed everything:**
  - Adapter and device through **blocking `WaitAny` with a timeout** (needs JSPI/Asyncify per emdawnwebgpu's source). Pthread: 597 ms / 16 ms. Main thread: 11 ms / 8 ms.
  - Surface on `#canvas`, 120 cleared frames submitted, yielding with `emscripten_sleep(0)`.
  - Blocking readback (`CopyTextureToBuffer` → `MapAsync` → `WaitAny`): correct pixel, **~3 ms per readback**.
  - Adapter (AMD RDNA3): core-features-and-limits, BC, dual-source-blending, timestamp-query and float32-filterable all yes. maxImmediateSize=64, minUniformBufferOffsetAlignment=256, maxBindGroups=4.
- **What this settles:** the target design works in Brave. The game runs in a pthread with JSPI, and aurora's blocking waits work unchanged.
- Caveats:
  - `emscripten_sleep(0)` doesn't wait for vsync (frames were produced at ~220 fps, so many are never shown). The game's VI pacing has to provide the timing.
  - Each EFB peek costs ~3 ms if MKW does many per frame.
  - JSPI and the pthread-baton fibers haven't been tested together. Each baton thread is its own worker, and a JSPI suspension inside a non-main guest thread is untested.

### Local server
- `web/server/server.mjs`, run with emsdk's Node: `D:\mkw-web\emsdk\node\24.19.0_64bit\node.exe D:\mkw-web\web\server\server.mjs`.
  - Bound to **127.0.0.1:3000 only** (checked with netstat).
  - COOP/COEP/CORP headers on every response; `.wasm` served as `application/wasm`.
  - Path traversal is refused (404).
  - `POST /log?variant=` writes `web/logs/probe-<variant>.log`.
  - Mounts: `/gputest/` → `web/gputest/out`; `/` → `web/site`. There's no `/game/` mount yet.

## 2026-10-26 — First-boot work started (stopped: usage limit)

### Done
- **`runtime/src/platform/web/guest_flat_memory_web.cpp`** written, not compiled yet. `GuestFlat` on plain `calloc` buffers, using the native section-offset rules (MEM1 `base & 0x01FFFFFF`, MEM2 `base & 0x0FFFFFFF`, Owned regions get their own buffer). Protection calls are no-ops and fault counters stay zero.
- **Junction** `D:\mkw-web\Wiicompiled\generated` → `D:\mkw-web\native\WiiCompiled\BuildWorkspace\generated`. It's gitignored (`/generated/`), and nothing was copied.
- Server: still no `/game/` mount.

### Findings that change the plan
1. **Data blobs:** `generated/data_sections_init_blobs.S` uses Windows COFF syntax (`.section .rdata,"dr"` plus `.incbin`), so it won't assemble for wasm.
   - `data_sections_init.cpp` only needs 11 `extern "C" const uint8_t kData_*[]` arrays.
   - The `StaticR` blob is **not** the raw REL file; the translator stores it already relocated, and it's 4,933,744 bytes vs 4,902,804.
   - Plan: on web, generate (at CMake time, from the blob file sizes) a .cpp that defines those 11 arrays with exact sizes. Fill them at startup from a read-only server mount of `generated/data_sections_init_blobs/`, before `InitializeDataSections()` runs (called in `system_bridge.cpp:321`). Use sync XHR from the worker.
2. **DVD files:** `dvd.cpp` uses `std::filesystem` directory iteration and `file_size` plus `ifstream`. Plan: a one-time import page copies `D:\mkw-web\game\extracted` into OPFS (inside the throwaway Brave profile on D:), mounted through the WASMFS OPFS backend (`-sWASMFS`).
3. **Design conflict (important):** browser WebGPU objects belong to the JS thread that created them. With pthread-baton fibers, GX/aurora calls from any guest thread other than the one that created the device would fail. Also, aurora has its own **render worker thread** that must run inline or be confined to the WebGPU thread.
   - Routing GX through the runtime GX worker would fix WebGPU ownership, but it runs concurrently, which breaks the `-Dthread_local=` trick.
   - The cleanest fix is real stack switching on one thread. **Tested:** `emscripten_fiber_swap` (`web/fibertest/fiber.cpp`):
     - `-sASYNCIFY`: builds and runs correctly in Node.
     - `-sJSPI`: builds, but the generated JS still calls `_asyncify_start_unwind`/`rewind` (Asyncify mode-1 exports that don't exist under JSPI), so **Emscripten fibers don't work with JSPI** in this version. The Node run also failed with `WebAssembly.Suspending is not a constructor` (Node 24 needs `--experimental-wasm-jspi`). That part is a test-harness problem, not the verdict.
   - Options to decide next session:
     - (a) Full Asyncify on ~7.8 M lines. Likely very large code growth and slow builds; would need `ASYNCIFY_ONLY`/`ASYNCIFY_REMOVE` lists to stay viable.
     - (b) Keep pthread batons, but proxy every aurora/WebGPU call to one dedicated thread. Means wrapping the aurora API boundary.
     - (c) A JSPI-based context switch written by hand (wasm stack switching through `WebAssembly.Suspending`/`promising` in custom JS). Experimental.
   - **Recommendation:** try (b) first. GX already funnels through `GxWorker`'s record/execute queue, so making the GX worker the *only* WebGPU thread fits the existing design. `thread_local` must then stay real for the GX worker's own state (`t_onWorker`, `t_inlineDepth`), so replace the blanket `-Dthread_local=` with a targeted list.

## 2026-10-27 — Option (b) implemented: the GX worker is the only WebGPU thread

### Verified in Brave first (`web/gputest`, new variants)
- **`stdthread`:** the probe on a plain `std::thread`, not the `main()` thread.
  - `emscripten_sleep` works, and so do adapter/device creation through blocking `WaitAny` and readbacks.
  - So **JSPI suspension works on non-main pthreads**, not only `main`.
- **`canvasthread`:** a pthread created with `emscripten_pthread_attr_settransferredcanvases(&attr, "#canvas")` (built with `-sOFFSCREENCANVAS_SUPPORT`, **without** `OFFSCREENCANVASES_TO_PTHREAD`).
  - Device, surface, 120 rendered frames and readbacks all worked from that thread.
  - Note: with `OFFSCREENCANVASES_TO_PTHREAD=#canvas`, creating any *second* pthread crashes (`offscreenCanvas` undefined). Don't use that flag in the game build.
- `web/gputest/pre.js` forwards stderr, aborts and uncaught errors to `/log?variant=<name>-console`.

### Changes
- **`include/guest_abi/fiber_shared.h`:** `MKW_FIBER_SHARED` is `thread_local` natively and a plain global on web. It replaces the blanket `-Dthread_local=`, which is gone from CMake. Applied to state all guest threads must share:
  - `GuestFiberManager::s_cpuContext`, `g_currentCpuContext`, `g_currentTranslatedExecutionAddress`
  - the 3 FP NI mirror variables
  - `g_alarmProcessDepth`, `g_nandCallbackDrainDepth`
  - Everything else stays `thread_local`: the GX worker and AX mixer flags, GX caches, timers, RNG, dispatch memo caches and diagnostic sets.
- **`gx_worker.h`:** `GxWorker::RunOnGpuThread(fn)`. On web it's `Submit` + `Sync` (fn runs on the worker while the caller waits); natively it's an `InlineScope` around fn.
- **Converted to `RunOnGpuThread`** (the scopes that call aurora):
  - `GX__Init` (body before the return), `GX__SetCPUFifo`, `GX__SetGPFifo`, `__GX__SaveFifo`, `GX__GetCPUFifo`, `__GX__PEInit`
  - `GX__CopyTex`
  - `GX__DrawDone`: only `GXDrawDone()`; the guest interrupt handler stays on the guest thread.
  - `VIConfigure`
  - Left as plain inline scopes because they only read runtime state and never touch WebGPU: the texture/vertex getters (6 sites). The settings-overlay ones (4) are left too; the overlay is off on web.
- **`gx_worker.cpp`:**
  - On web the worker is a pthread created with the canvas transferred (`WorkerThread`); natively it's still a `std::thread`.
  - On web the worker is always started (it ignores `[video] gx_worker`).
  - On web the idle wait yields with `emscripten_sleep(1)` instead of a condvar, so the canvas presents and events arrive.
- **`main.cpp`:** on web, `GxWorker::Start()` runs **before** `aurora_initialize`, which runs on the worker. The post-init aurora setup (frame-worker callback, aurora hooks, dynamic aspect, runtime settings, skip-unready) also runs through `RunOnGpuThread`.
- **`aurora_events.h`:** `aurora_begin_frame_window`, `aurora_end_frame_window` and `aurora_update` run on the GPU thread on web.
- **aurora `gfx/render_worker.cpp`:** on web `initialize()` doesn't start the thread, so `enqueue()` runs everything inline on the caller (the GX worker).
- **Build status:** the web audit (runtime + aurora) compiles clean (`web/build-audit/audit5.log`), including `guest_flat_memory_web.cpp`. The 10 touched shared runtime files also pass a **native** `-fsyntax-only` check with llvm-mingw.

### Known risks of this design (not yet runtime-tested)
- `GX__Init` and `__GX__PEInit` now run guest-OS helpers (interrupt registration, `OS__GetCurrentThread`) on the worker. That's safe only because the guest thread is blocked and the state is `MKW_FIBER_SHARED`.
- Each `RunOnGpuThread` call is a full round trip (`Submit` + `Sync`). The per-frame window calls add a few of those each frame.
- The 1 ms yield polling adds latency to the worker's wake-up.
- Any aurora call not yet found that runs off the worker would fail at runtime. The browser will report it as a WebGPU "object from another thread" style error.

## 2026-10-28 — MILESTONE 1 REACHED: "boots" (in Brave)

### What runs
Boot 2 in Brave 1.98.60, throwaway profile `D:\mkw-web\web\brave-profile`, log in `web/logs/probe-game.log`:
- The module loads, OPFS is mounted, and `Config.toml` is read from `/opfs/WiiCompiled`.
- Guest RAM is up (155 MiB in 4 sections) and the data blobs come from `/blobs/`.
- **43 + 192 static constructors run**, the same counts as native.
- The GX worker starts. aurora gets a **WebGPU adapter and device** on the GX worker: core feature level, BGRA8Unorm, Fifo; BC, dual-source blending and texture swizzle enabled.
- The game reaches its own OS init (the `__init_hardware`, OSExceptionInit, OSInterruptInit and EXI HLE stubs, as natively).
- **Then it stopped:** `Missing bundled Wii DSP coefficient ROM (dsp_coef.bin)`.
  - Cause: `RuntimeConfigFile::ExecutableDirectory()` in `runtime_config.h` is a second copy of the helper and still read `/proc/self/exe`. Fixed: it returns `/app` on web.
  - aurora also looked for `initial_pipeline_cache.db` at `/`. Fixed: `auroraConfig.resourcesPath = "/app/"` on web.
- Boot 1's failure (archived in `web/logs/boot1-game.log`) was "Failed to create surface" plus "No supported graphics backend". Fixed:
  - `lib/dawn/BackendBinding.cpp`: Emscripten surface from the `#canvas` selector.
  - `gpu.cpp`: on web, Core feature level and no backend type in the adapter request.
  - `aurora_core.cmake`: `ENABLE_BACKEND_WEBGPU` defined on Emscripten.

### Pieces added this session
- **Full web build** (`web/configure-game.sh` → `web/build-game`):
  - Global flags `-pthread -fwasm-exceptions -sSUPPORT_LONGJMP=wasm`. The translated and runtime targets also get `-msimd128 -msse4.2`.
  - Product link flags: `-sJSPI -sPROXY_TO_PTHREAD -sOFFSCREENCANVAS_SUPPORT -sWASMFS -sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=512MB -sMAXIMUM_MEMORY=4GB -sSTACK_SIZE=8MB -sPTHREAD_POOL_SIZE=8`, with `--embed-file` for the `/app` assets: Wii bootstrap tree, DSP ROM, initial pipeline cache. All are project assets, not game data.
  - **First link succeeded:** `WiiCompiled.js` (267 KB) plus `WiiCompiled.wasm` (114 MB), 28,891 translated functions.
  - A full build took roughly 15–20 minutes here. Incremental relinks are a few minutes.
- **Data-blob loader:**
  - On web, `PublicProducts.cmake` generates `build-game/web_data_section_blobs.cpp`. It holds the 11 `kData_*` arrays, sized from the blob files, and `MkwWebLoadDataSectionBlobs()`.
  - That function fetches `/blobs/<name>.bin` through `WebPlatform::FetchInto` (synchronous XHR in the worker). It's called in `SystemBridge::Initialize` before `InitializeDataSections()`.
  - The .wasm contains **no** DOL/REL data sections. The translated code is still game-derived, so the .wasm stays local only.
- **`src/platform/web/web_platform.cpp` and `include/platform/web_platform.h`:**
  - `MountStorage()`: WASMFS OPFS backend at `/opfs`, with `XDG_DATA_HOME=/opfs`.
  - `FetchInto()`.
  - `RuntimeMain` calls `MountStorage()` first on web and skips the console attach, the signal handler and the transcript pipes.
- **`host_platform.cpp` and `runtime_config.h`:** both `ExecutableDirectory()` copies return `/app` on web.
- **Game-file import:** `web/site/import.html` (add `?auto` to start without a click).
  - Copies every file listed by `/game-manifest.json` from `/game/` into OPFS `WiiCompiled/dvd/`, skipping files that already match, and writes `WiiCompiled/Config.toml` (`dvd_root = "/opfs/WiiCompiled/dvd"`).
  - **Done once:** 2,017 files, 2,558.9 MiB, in 51 s, into the throwaway profile on D:.
- **Game page:** `web/site/play.html` has `<canvas id="canvas">`. It mirrors all output on the page and POSTs it to `/log?variant=game`.
- **Server** (`web/server/server.mjs`, still 127.0.0.1:3000 only):
  - `/game/` → `D:\mkw-web\game\extracted` (read-only)
  - `/blobs/` → the native install's `generated/data_sections_init_blobs` (read-only)
  - `/play/` → only `WiiCompiled.js` and `WiiCompiled.wasm` from `web/build-game` (allowlist)
  - `/game-manifest.json`
  - All verified: other files under `/play/` and traversal attempts return 404.
  - The server stops when the Claude session goes idle. Restart it with `D:\mkw-web\emsdk\node\24.19.0_64bit\node.exe D:\mkw-web\web\server\server.mjs`.

### How to run it (for the next session)
1. Start the server (command above).
2. Run `web/configure-game.sh` once, then `ninja -C D:\mkw-web\web\build-game WiiCompiled` (with emsdk env sourced; see `web/env.sh`).
3. Import once per browser profile: `brave --user-data-dir=D:\mkw-web\web\brave-profile http://localhost:3000/import.html?auto`.
4. Play: `brave --user-data-dir=D:\mkw-web\web\brave-profile http://localhost:3000/play.html`. Output goes to `web/logs/probe-game.log`.

### Boots 3–9 (2026-10-28): fixes, then a hang
- **Fixed:**
  - `runtime_config.h` `ExecutableDirectory()` returns `/app` on web.
  - `auroraConfig.resourcesPath = "/app/"` on web.
  - NAND `setting.txt` is published with a rename on web (no hard links).
  - `RuntimeConfigFile::Reload()` runs after the OPFS mount, because static constructors had cached the default config.
  - `render_worker::initialize()` records the GPU thread as the worker thread on web.
  - `surface.Present()` is skipped on web (the browser presents when the thread yields).
  - aurora `gx/fifo.cpp` uses `ProcessingMode::Drain` on web, so there's no FIFO worker thread.
  - Link flag `--profiling-funcs`, so stacks show function names.
- **Now reaches:**
  - DVD index (2,012 files, file table published).
  - GXInit through the GPU thread, then VIInit.
- **HANG after VIInit (boot 9).** The main game thread is stuck in `VIWaitForRetrace` → `OSSleepThread` → `SelectThread` → `AdvanceDueRetraces` → `GxWorker::Sync()` (`WaitForTail`). The GX worker never drains its queue, and its thread is blocked in a wait, so it can't be paused for a stack.
  - Next step: find which command the GX worker blocks in. Options:
    - Log every record the worker executes.
    - Have the worker periodically `emscripten_sleep(0)` inside long commands, so it becomes pausable.
  - Suspects:
    - A `RunOnGpuThread` call or `Sync()` issued *from* the worker. The worker would then wait on itself.
    - The aurora frame-worker wait callback (`ServiceGuestTimingDuringAuroraFrameWait`) running guest timing on the worker.
- **Diagnostics tool:** `web/tools/stackdump.mjs` dumps per-thread stacks over the DevTools protocol. It needs Brave started with `--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1` and the throwaway profile. Dumps are in `web/logs/stackdump*.txt`.

## 2026-10-29 — The game loop runs; it crashes at the first scene transition

### Fixed this session
- **The VIInit hang:** aurora `gfx/frame.cpp` `wait_for_gpu_progress()` blocked on a condvar. In the browser, `MapAsync` callbacks only run when the thread returns to its event loop, so `begin_frame()` waited forever for a mapped staging buffer. On web it now yields with `emscripten_sleep` (JSPI).
- **Main-thread starvation:**
  - `play.html` rewrote the whole log panel per line. Now it buffers and redraws at most 4×/s, keeping the last 1,000–2,000 lines.
  - `hle/net/network_deferred.cpp` no longer runs its "ran off the emulation thread" check on web. That check is meaningless with baton pthreads, and it produced ~19k log lines.
  - The starvation mattered: SDL's focus handler, running on the GX worker, makes a synchronous call to the browser main thread, so a swamped main thread stalled the GX worker.
- **Stall diagnostics (web only):**
  - `fiber_manager.cpp` keeps the last 24 guest-thread handovers.
  - A watchdog thread prints `[heartbeat]` every 5 s (guest switches, VI retraces/s, current guest thread) and a `[stall]` history after 5 s with no switch.
  - `VI_HLE_DiagnosticRetraceCount()` was added in `hle/vi.cpp` for it.
- `web/tools/stackdump.mjs` no longer waits on replies from blocked workers.
- **New `web/site/verify.html?auto`:** compares every OPFS game file to the server copy. **Result: 2,017 files, 0 differences.**

### Where it is now (boots 11–13)
- The full native startup sequence runs. In order:
  - REL module load and link (1.4 s vs 14 ms native: the cost of the checked memory path).
  - The aurora shader cache in OPFS.
  - DWC; AX/DSP audio init, with the mix worker thread started.
  - RFL, LYT, CINS, the NW4R libraries.
  - **The scene system:** "Scene Exit" lines, then the THP and NCD libraries.
- **The game loop really runs:** the heartbeat showed 35–86 VI retraces/s, with guest threads switching normally.
- **Then a guest crash** at the first scene transition, consistent across runs:
  `AccessViolation addr=0x30310100 (no mapped region)` in `EGG::ExpHeap::free` ← `EGG::SceneManager::destroyScene` ← `destroyCurrentScene` ← `RKSceneManager::calcCurrentFader` ← `RKSystem::Run`.
  - A garbage pointer in the guest heap means something earlier corrupted guest memory.
  - Native doesn't crash here. The disc data at rest is verified intact.
  - Boot 11 got 2 scene exits before stopping; boot 13 crashed before the first. Timing-dependent.
- Audio printed once: "output queue full … dropping blocks". Not investigated.

### Hunt results (2026-10-29, later)
- **What the crash actually is.** The faulting read hit address `0x00000004`, which maps to low MEM1, where the DVD HLE writes the disc header. `0x30310100` is the maker code `"01"` plus the disc number.
  - The game calls `EGG::ExpHeap::free` on a **NULL heap**: `findContainHeap` found no heap containing the scene's memory when `destroyScene` ran.
  - So an allocation or a heap list went wrong earlier. This is not random byte corruption.
- **Ruled out:**
  - **The imported disc files in OPFS:** `verify.html`, 0 of 2,017 files differ.
  - **The DVD read path:** reads are synchronous (`ReadExact`, then the callback runs immediately), and the read length is checked exactly.
  - **The setjmp/longjmp error recovery:** it's only reached from the native fault handlers.
  - **The dispatch memo caches:** per-thread copies are fine, because entries map static addresses to immutable records.
  - **Clock skew between workers:** Emscripten's pthread clock is `performance.timeOrigin + now()`.
  - **The checked memory path itself.** Differential test: native build with `RequiresCheckedAccess()` forced to `true` (translated shards rebuilt in the install's `BuildWorkspace`). It ran 90 s, had 3 scene exits and **no crash**. The install was restored afterwards and the exe matches `Base\WiiCompiled.exe` again.
- **Remaining web-only differences, in suggested order:**
  1. **SSE intrinsics emulated on wasm SIMD.** Some intrinsics differ in edge cases: NaN handling in min/max, `_mm_rcp_ps`/`_mm_rsqrt_ps` being exact on wasm, and there's no MXCSR **rounding-mode** control (only FTZ was mapped). If the runtime maps FPSCR rounding modes onto MXCSR for `fctiw` and similar instructions, wasm always rounds to nearest. Check the `_mm_setcsr`/`_mm_getcsr` and rounding-mode uses in `isa/`.
  2. **32-bit host:** `size_t`/`uintptr_t` and pointer-size assumptions in runtime HLE code (OS heap/arena helpers, ARC/NAND, the GX worker ring), which the native build never exercised.
  3. **The baton-thread model:** guest code now runs on several pthreads, plus the `RunOnGpuThread` cases that run guest-OS helpers on the GX worker (`GX__Init`, `__GX__PEInit`).
  4. **No denormal flush-to-zero (NI)** on web.
- **FP differential test done:**
  - **No rounding-mode control exists anywhere** in the runtime: MXCSR is only used for the NI flush-to-zero bits. So "wasm always rounds to nearest" isn't a difference.
  - Native build with the FP control word made software-only (MXCSR never written, so no FTZ, like the web build), with the runtime compiled from source (`MKW_USE_PREBUILT_RUNTIME=OFF`) so all FTZ switching was affected.
  - Result: ran 90 s, **no crash, no access violations**, but only 1 scene exit (vs 3 for the checked-memory test). This is **weak evidence**: it may just not have reached the transition, so rerun it longer if FTZ becomes a suspect again.
  - The install was restored afterwards: header, exe (matches `Base\WiiCompiled.exe`) and `CMakeCache.txt` (prebuilt runtime ON). The `native-build` object files are from the test build, so the next native rebuild there will recompile. `Base\` was never touched.
- **What's left:**
  1. The 32-bit host (`size_t`/`uintptr_t`/pointer size in runtime HLE code).
  2. The baton-thread model, plus guest-OS helpers running on the GX worker via `RunOnGpuThread`.
  3. SSE-on-wasm-SIMD edge cases (NaN handling in min/max, exact rcp/rsqrt).
- **Next experiment ideas:**
  - Web build with `RunOnGpuThread` limited to the aurora calls only, so `GX__Init`/`__GX__PEInit` run their guest-OS parts on the guest thread again.
  - A web debug build with `-sSAFE_HEAP=1` / `-sASSERTIONS=2`, to catch out-of-bounds or misaligned host accesses in the runtime (32-bit bugs).

### CORRECTION (boot 15): the crash is NOT fixed
- Boot 15 (with `[network] enabled = false`, now also written by `import.html`) hit the **same** NULL-heap `free` in `EGG::SceneManager::destroyScene` ← `RKSceneManager::calcCurrentFader`.
- Boot 14 had simply never reached the first scene change in its 3 minutes. The "steady 60 fps, no crash" result was the game sitting in the scene it later crashes leaving. The GX-init change below is still correct (only aurora calls belong on the GPU thread), but **it was not the cause**.
- The white screen the user saw is that same scene: frames are presented (no WebGPU validation errors in the browser console, per `web/tools/console.mjs`), but the content is white.
- Status: timing-dependent crash at the first scene teardown is still open. Untested suspects: 32-bit host bugs (try a `-sSAFE_HEAP=1 -sASSERTIONS=2` debug build), SSE-on-wasm edge cases, and the baton-thread model in general.

## 2026-10-29 — MILESTONE 2 REACHED: past the title screen (attract mode runs)
- The user sees the loading/title screens followed by **attract-mode demo races with CPU karts** in Brave. Their reports: "super stuttery", and no input.
- **Input** (`settings_overlay.cpp`, `InitializeRuntimeSettings`):
  - The web build has no F10 bar, so player 1 had **no keyboard bindings** (aurora only reads the keyboard for a port with mappings set).
  - On web, if player 1 has no saved keyboard bindings, a keyboard-only layout is applied and serialized: arrows = stick, X = A, Z = B, Left Shift = R, Space = L, Enter = Start, C/V = X/Y, Q = Z, WASD = D-pad, IJKL = C-stick.
  - Boot 18 logged `web: applied the default keyboard layout to player 1`. **Not yet confirmed working** by the user.
- **INPUT FIXED (boot 25), verified by the PAD log:** after `presskeys.mjs` sent X, the game's PAD read returned `PAD0 buttons=0x0100` (A), then released. Three fixes were needed:
  1. **Player 1 keyboard mode was reset by the game's own `PADInit`**, which reloads (empty) saved mappings in the browser. That gave `err=-1` (no controller).
     - `settings_overlay::ApplyWebKeyboardDefault()` (public, web only) now always applies the layout.
     - It's called from `InitializeRuntimeSettings`, and from `PAD__Init_HLE` right after `PADInit` (both on the GX worker).
  2. **Game input was blocked by the runtime's startup cover.** `ApplyInputBlockState` blocks the pad while `StartupScreenVisible()` is true, and that's only cleared by overlay draw logic that doesn't run on web. On web, `ApplyInputBlockState` never blocks (no overlay screens are drawn there).
  3. The earlier two (still needed): `PADRead` on the GX worker; the ImGui layer never captures on web.
- **Correction:** the "game never calls `PAD::Read` on web" finding (boots 19–23) was wrong. Those checks ran at 60–75 s, before the game reached `RootScene::enter`. The `PAD::Read` polling does run every frame on web.
- **User confirmed: keys work (MILESTONE 3: menus work with the keyboard).** The debug logs were removed and the fix committed locally (Wiicompiled `51f5023`, aurora `0117ff3`).
- **Stutter, first fix (boot 26, uncommitted, waiting for the user's verdict):**
  - The GX worker's idle wait polled with `emscripten_sleep(1)` (`setTimeout`). Browsers clamp nested timers to ≥4 ms, so each `Submit`+`Sync` round trip (several per frame) could cost ~4 ms.
  - Now (`gx_worker.cpp`, web only) it uses a condvar `wait_for(1 ms)`, woken at once by `Publish()`, and returns to the event loop at most every 4 ms through `MkwWebYieldToEventLoop()`: an `EM_ASYNC_JS` MessageChannel round trip, which isn't clamped.
  - Boot 26: no errors, steady ~60 VI retraces/s.
  - If it's still stuttery, next candidates: per-frame `RunOnGpuThread` round trips (begin/end window, `aurora_update`, `PADRead`) and the checked-memory cost on the game thread. Measure frame-to-frame present intervals on the GX worker.
- (Done) remove the temporary `[input-debug]` logs (`sdl_input.cpp`, `pad.cpp`) once the user confirms the keys work.
- **Earlier input notes (boots 19–22):**
  - The user's recording showed the Wii Remote strap screen repeatedly fading in and out (it waits for A), then flashing, then the demo. Keys pressed by the user didn't register.
  - **Test tool:** `web/tools/presskeys.mjs` sends real key events to the page over DevTools (needs Brave with `--remote-debugging-port=9222`).
  - **Temporary web-only debug logs** (remove when done): `[input-debug]` lines in aurora `lib/input/sdl_input.cpp` (SDL key down) and in runtime `hle/input/pad.cpp` (PAD read count and PAD0 buttons).
  - **Confirmed:** SDL receives every key (scancodes 27 = X, 40 = Enter, 82 = Up), on the GX worker.
  - **Changes made so far** (keep them; they're correct for web regardless):
    - `pad.cpp`: on web, aurora's `PADRead()` runs on the GX worker via `RunOnGpuThread`, the thread that owns SDL and the input router.
    - aurora `imgui.cpp`: on web the ImGui input layer never captures input (the overlay isn't drawn on web).
  - **Key finding:** the runtime's `PAD__Read_HLE` hook (registered as `PPC_NATIVE_OVERRIDE(801AF44C, …)`, a PAL-style address translated to NTSC-U at registration) is **never called** on web. No `PAD read #` line ever appears.
    - So on web the game doesn't poll the GameCube pad through the runtime's hook during the strap screen, or reaches it some other way.
    - The user confirmed in Phase 1 that native menus work, so it must work natively.
  - **Controller trace (2026-10-30):** `PAD::Read` (`0x801AF3AC`), `KPAD::Read` (`0x801972E0`) and `WPAD::Read` (`0x801C11EC`) were added to `MKW_GUEST_CALL_TRACE` as `[trace-poll]`, logged every 60th call, plus a `[trace-site]` probe for `lr=0x8053E6A8`.
    - **Native:** `PAD::Read` is called once from `RootScene::enter` (`lr=0x8053E6A8`), then **every frame** from `GameScene::calc` (`lr=0x8051712C`).
    - **Web:** zero `PAD::Read`, `KPAD::Read` and `WPAD::Read` calls; nothing passes the hook at that return address.
    - The heap/scene traces are identical up to call #3272. Then native calls `PAD::Read`, while web goes straight to `createChildScene`.
    - `RootScene::enter`'s direct callees include **`Input::Manager::Update` (`0x8051F47C`)**, which natively tail-calls `PAD::Read`. On web it runs but never reaches `PAD::Read`.
    - **Conclusion:** the game's input manager decides there's no GameCube pad to poll, before any `PAD::Read`. It's not that input is lost on the way.
  - **Ruled out:** the PAD override address (PAL `0x801AF44C` → NTSC `0x801AF3AC`, the same `-0xA0` shift as `VIInit`); MMIO handling (MMIO reads are blocked and throw on both paths).
  - **Next:** find the condition in `Input::Manager::InitControllerHolders` (`0x8051FE64`) / `Update` (`0x8051F47C`) that enables GameCube-pad polling. Read their translated code in `generated/build_shards`, or trace their callees and the SI/PAD status queries (`SIGetType` `0x801B3768`, `SIGetStatus` `0x801B2FB0`, `PADInit`/`PADReset`) in native vs web.
  - The native install was restored after this trace (exe matches `Base\`); the trace define is off again.
  - **Earlier next steps (superseded):**
    1. Find the NTSC-U address the PAD override resolves to, and whether it's registered at all on web. Compare the native registry dump with web, or log registrations of PAD overrides at startup.
    2. Or add the PAD and KPAD/WPAD entry points to the `MKW_GUEST_CALL_TRACE` set and diff native vs web, like the heap/scene trace.
    3. Check that `KnownNativeCpuCall`/native-index routing for these targets matches between the native and web builds.
- **Stutter:** not investigated yet. The heartbeat shows game-side VI pacing steady at ~60/s, so the stutter is probably in presentation:
  - the GX worker's 1 ms yield polling;
  - `emscripten_sleep(0)` not waiting for vsync;
  - per-frame `RunOnGpuThread` round trips;
  - and/or the checked-memory cost.

### ROOT CAUSE FOUND AND FIXED (boot 17, verified by trace)
- **Method:**
  - Added an optional call trace in `guest_abi/dispatch.h` (`MKW_GUEST_CALL_TRACE`, off by default). It logs entry into EGG heap and scene functions (NTSC-U addresses) with r3–r6/lr, inside `ApplyRuntimeCallOptions`.
  - Built it into a native run (in the install's `BuildWorkspace`, runtime from source; restored afterwards, exe matches `Base\` again) and into a web run, then diffed the two.
- **First divergence:** `EGG::Thread::__dt` (`0x802425F0`) freed `0x9012D568` on native but **`0x00000000`** on web. A live `EGG::Thread` field had been zeroed. Everything before it matched exactly, including heap addresses.
  - (The two apparent extra `Heap::Alloc` lines on web, from `DiscCheckThread::create` and `ModuleLinker::Create`, were a trace artifact. Native makes the same `ExpHeap::Alloc` calls; its outer call just isn't seen by the hook.)
- **Cause:** my web `HostContext::Destroy` woke the parked pthread of a destroyed guest thread so it could `pthread_exit()`.
  - In Emscripten with wasm exceptions, `pthread_exit` unwinds by throwing, which runs every pending C++ destructor on that dead guest stack.
  - Those destructors (CPU-context and register guards) wrote stale state into guest-visible memory, asynchronously, whenever that thread got scheduled. That's why it was timing-dependent.
- **Fix** (`src/host_context.cpp`, web backend): `Destroy()` only marks the context and **never wakes it**, so its stack is discarded without unwinding, like `DeleteFiber`/`co_delete`. Cost: one leaked parked pthread, stack and Context per destroyed guest thread. Worth revisiting if MKW destroys threads often, for example by reusing parked workers.
- **Verified in boot 17:**
  - The trace passes `destroyCurrentScene` → `destroyScene`, with `EGG::Thread::__dt` freeing the correct `0x9012D568`.
  - Then `changeScene`, and later a **second** scene change (`changeScene` to `0x14`, `destroyScene` at call 4017): ~6,100 heap/scene calls.
  - No access violation, no errors, steady 60 VI retraces/s.
- The trace define was switched back off after the test; the code stays behind `#ifdef MKW_GUEST_CALL_TRACE`.
- **Next:** check what's on screen now (it was white before) and whether the intro movie and title scene follow. Then the "title screen" milestone.

### Safe-heap test (boot 16): no host memory bug before the crash
- Built `web/build-game/WiiCompiled-safe.js/.wasm` (132 MB): the normal link plus `-sSAFE_HEAP=1 -sASSERTIONS=2 -sSTACK_OVERFLOW_CHECK=2`.
  - How: `ninja -d keeprsp` keeps `CMakeFiles/WiiCompiled.rsp`, then `web/build-game/link-safe.bat` relinks from it.
  - Load it with `play.html?build=safe`. The server allowlists the `-safe` files.
- **Result:** the same guest AccessViolation (NULL-heap `free` in `destroyScene`) with **no SAFE_HEAP, alignment or stack-overflow report before it**. The later "Assertion failed" abort is the runtime's fatal-exit path.
- **Ruled out:** out-of-bounds and misaligned host accesses (including 32-bit pointer or size truncation that would produce them) in the runtime, aurora and the translated code.
- **Still possible:**
  - **Wrong values without bad accesses:** SSE-on-wasm edge cases, or 32-bit truncation that stays in bounds.
  - **The baton-thread model**, for example guest state that natively was per host thread but that I made shared, or the reverse.
  - **The GX worker or mixer** writing guest memory at different times than natively.
- **Next idea:** a native/web execution trace comparison. Log every scene-manager and heap call (`EGG::Heap::alloc`/`free`, `ExpHeap::create`, `SceneManager::createScene`) with arguments and results in both builds, and diff them to find the first divergence.

### (Earlier, wrong) "CRASH FIXED (boot 14)": the threading change in GX init
- `hle/gx/gx_init.cpp`:
  - `GX__Init` is back to a plain `GX_SYNC_INLINE()` on the guest thread. Only aurora's `GXInit()` call goes through `GxWorker::RunOnGpuThread`.
  - `__GX__PEInit` (guest-OS work only, no aurora) is a plain `GX_SYNC_INLINE()` again.
  - Before this, both ran their whole body on the GX worker: interrupt-handler registration, `OS__GetCurrentThread()` into GX data, guest memory init. Running guest-OS code on a non-guest thread left bad state behind, which surfaced as the NULL-heap free at the first scene change.
  - **Rule going forward:** `RunOnGpuThread` must wrap **only** aurora/WebGPU calls, never guest-OS or guest-callback work.
- **Boot 14 result:** no crash in 3+ minutes. The heartbeat shows a **steady ~60 VI retraces/s** (previously an erratic 35–86) and ~600 guest switches/s. No errors.
- **New sticking point:** the game stays in the scene after the THP and NCD libraries load. Natively that scene exits within seconds, then the intro movie and title scenes cycle.
  - Suspects: THP movie decoding too slow on web (boot 11 caught the THP decoder thread running), or audio (one "output queue full … dropping blocks").
  - Next: stack-sample during this phase to see which guest thread is busy, and how far the THP decode gets per second.

### Suspects for the corruption (to investigate next) — superseded, kept for reference
1. **WASMFS/OPFS read path:** partial reads or offsets in `std::ifstream`/`pread` through the OPFS backend. Test by reading a few files through the game's DVD code and comparing checksums with the server.
2. **Web memory path** (`FlatLoad`/`FlatStore` → `Memory::Read*`/`Write*`), and the quantized PSQ stores under `RequiresCheckedAccess`. Check the byte-order and size handling for 64-bit and paired-single cases.
3. **`MKW_FIBER_SHARED` choices:** a piece of state that should have stayed per-thread (or vice versa). For example, the dispatch memo caches are still `thread_local` per baton thread.
4. **Concurrency:** the GX worker and audio mixer touch guest memory while a guest thread runs. Natively that's the same, but timing differs.
5. **32-bit host differences:** `size_t`/`uintptr_t` truncation in the runtime's HLE helpers (heap, DVD, ARC), which the native 64-bit build never exercised.

### Next (toward "title screen")
0. ~~Decide the fiber/WebGPU-thread design~~ → (b), done.
1. ~~`src/platform/web/guest_flat_memory_web.cpp`~~ (written; compile it with the audit).
2. Product link with the translated shards: `MKW_BUILD_PRODUCTS=ON`, `-sJSPI -pthread -sPROXY_TO_PTHREAD -sOFFSCREENCANVAS_SUPPORT`, `-Dthread_local=`, exceptions; `gx_worker` off and inline AX mixing.
3. Make the VI pacing sleeps yield (`emscripten_sleep`) so the canvas presents.
4. A `/game/` mount (read-only, `D:\mkw-web\game\extracted`) and a WASMFS fetch backend for DVD files.
5. First boot attempt in Brave. Compare the console log with the native `console.log`.

## 2026-10-30 — Stutter work (uncommitted, measured in Brave)
- **New per-frame stats** (heartbeat every 5 s in the page log `web/logs/probe-game.log`):
  - `[frames]`: presents per second, frame gaps, GX worker busy %, % of game-thread time spent waiting in `GxWorker::Sync`.
  - `[sync-site]`: the 10 call sites that waited longest. `Sync`, `BeginInline`, `InlineScope` and `RunOnGpuThread` now take the caller's file and line via `__builtin_FILE()/__builtin_LINE()` default arguments.
- **Disc read cache** (`hle/dvd_contract.h`, web only): files stay open, 1 MiB blocks in a 256 MiB LRU. **15–20 → 33–35 fps**, the biggest win so far.
- **Did NOT help (reverted):** longer spin-waits before sleeping (worker 2 ms, guest 1 ms). Still ~33–35 fps.
- **What the counters showed (attract-mode race, ~33 fps, ~30 ms per frame):**
  - The game thread waited ~6 ms every frame for the worker to finish the frame (`EndAuroraFrame`'s trailing `Sync`).
  - The rest of the waits were small: `GXDrawDone` ×3 per frame (~0.3–0.6 ms each), begin-window, `PADRead`.
  - So the game thread's own CPU work is ~20 ms per frame. That alone caps it around 50 fps even with perfect overlap.
- **Changes made:**
  - `aurora_events.h`: on web, no trailing `Sync` in `EndAuroraFrame`. `aurora_update` runs as a record on the worker and leaves a copy of the events, which the game handles one call late (no wait). Result: the wait moved to the next frame's `BeginAuroraFrame` sync, so gains were small (~33 → 35–39 fps at best).
  - aurora `frame.cpp`: GPU-progress waits yield through a MessageChannel instead of `emscripten_sleep(1)`. `pace_frame_start` is skipped on web. No measurable change.
  - aurora `imgui.cpp`: **bug of mine fixed.** The web path rebuilt the ImGui font atlas (FreeType rasterizing every glyph) on every frame. It now builds only once. Begin-window wait went 0.9 → 0.14 ms.
  - `isa/ppc_isa_quantized.h`: the profile showed the quantized paired-single store (`PpcStorePairPsqQuantizedFastInline<u8>`) at **18% of all CPU**, plus PSQ loads at 6.5%. GQR-scaled loads and stores called `std::ldexp` (an out-of-line libm call in wasm) twice per instruction. Replaced with building the power of two from its exponent bits (same value).
- **Result of the PSQ change (boot after 20:39 build):** the store's share of CPU halved (18% → 9.6%), but the frame rate only went from ~33 to ~35 fps.
- **Current reading:** frames take ~28 ms, just over one 16.7 ms retrace, so each frame likely misses a retrace and waits for the next (≈30–35 fps). Total CPU across all threads is only ~3.3 s per 6 s, and much of the remaining "work" is clock calls from spin-waits. Cutting a few more ms per frame (mainly the ~6 ms frame finish on the GX worker that the game waits for) might jump it toward 60.
- **Next:** profile the GX worker alone during the frame finish (`aurora_end_frame_gx`) and cut that; reduce clock calls in the wait loops.
- **Bigger game view (user request):** `play.html` now fills the browser window with the game (kept 16:9). The status and log sit below it (scroll down). There's a "Full screen" button in the top-right corner; double-clicking the game also toggles full screen, and Esc leaves it.
  - **The first try crashed:** "Scissor rect 1165x654 is not contained in the render area 958x538". The game read the live canvas size before aurora had resized its swapchain. Fix (aurora, web only): `AuroraGetSurfaceSize`/`AuroraGetRenderSize` return `window::get_swapchain_window_size()`, the size last handed to the swapchain.
  - Verified: the character-select screen renders full width and sharp, with no renderer errors. It renders at the larger size now, so the measured rate there was ~25–28 fps (it was ~35 at the small size, on a different screen).

### Smoothness, round 2 (2026-10-30 evening, uncommitted)
- **Diagnostics overhead (mine), fixed:**
  - The GX worker's busy timer read the clock twice per record (thousands per frame; a browser clock read is a JS call). It now times whole batches.
  - `Sync` returns at once when the worker has already caught up, so the per-site bookkeeping only runs for real waits.
- **Removed per-frame waits (web only):**
  - `GX__CopyTex`: the copy state is snapshotted on the game thread and the GPU work is recorded, not waited for.
  - `BeginAuroraFrame`/`EndAuroraFrame`: the window and GX halves of a frame start and end as worker records in queue order. The game's own `GXDrawDone` waits keep it at most a frame ahead, as with real hardware.
    - **This first crashed:** `settings_overlay::Draw` used ImGui on the game thread before the worker had started the ImGui frame. On web, `Draw` now only does the non-drawing steps (boot-shader state, input block); nothing renders ImGui on web anyway.
  - `PAD__Read_HLE`: the worker samples the pads and leaves the result; the game uses the latest one (up to a frame old).
- **Measured (Brave, large window):** title/menus ~44–48 fps (was ~33–37). Attract-mode race ~34–36 fps (was ~25–28 at the large size).
- **Biggest remaining wait in races:** `GXGetTexObjAll` (`gx_texture.cpp`), ~6 per frame at ~1.1 ms. Texture-object info is kept on the worker, so each getter waits. Fix idea: keep a game-side copy of the metadata `GXInitTexObj` sets, so the getters don't need the worker.
- **Texture getters (`GXGetTexObjAll`/`GXGetTexObjLODAll`), web only:** they decode the guest `GXTexObj` directly (`ExtractTexObjMetaFromGuest`; the guest half of `GXInitTexObj*` is written synchronously) instead of waiting for the worker. Falls back to the old path if the decode isn't usable. The demo race went from ~34–36 to **~39–40 fps**. The only remaining waits are the game's own `GXDrawDone` calls (3 per frame, ~2.3 ms each).
- **Disk use (D:\mkw-web, ~24 GB):** game 7.2 GB (the .7z 2.2 GB, the .nkit.iso 2.6 GB and `extracted` 2.5 GB are three copies of the same disc); web 6.4 GB (mostly `brave-profile`, 5.6 GB, which holds the browser's imported copy of the game plus caches); native 4.6 GB (native install, only for comparisons); Wiicompiled 3.5 GB and emsdk 2.1 GB (only needed to rebuild). Playing alone needs ~2.7 GB: the game in the browser plus the ~116 MB build. Nothing deleted.

### Smoothness, round 3 (2026-10-30 late, uncommitted) — two big fixes
- **GPU staging copy (aurora `gfx/frame.cpp`, web only): the biggest CPU cost found so far.** The profile showed `_emwgpuBufferUnmap` at 60% of all CPU. On the web, `Unmap` copies the whole mapped range from wasm memory to the GPU process, and aurora maps its 64 MiB staging buffer whole every frame (~2.5 GB/s of copying at 40 fps). Now:
  - Each frame stages into ordinary memory, one 64 MiB block per frame slot.
  - At frame end, only the bytes actually used in each region go to the GPU with `Queue::WriteBuffer`, which the queue orders before the frame's staging copies.
  - The staging buffers are `CopyDst|CopySrc` (never mapped), and `map_staging_buffer` marks them ready at once.
  - Result: GX worker load ~30% → ~11%.
- **Permanent freezes when the browser lost focus (aurora `window.cpp`, web only).** `pauseOnFocusLost` made `poll_events` block the GX worker in `SDL_WaitEvent`. The canvas lives in a worker that never gets focus events, so it never woke up, and the game deadlocked as soon as its record ring filled (seen by stack dump: the game thread waiting in `Reserve` from inside a `GXDrawDone` wait). On web `is_paused()` only reports "not presentable". This likely also caused some earlier "stalls".
- **Measured:** attract-mode race ~50–54 fps, menus/title ~54–58 fps (was ~39–40 and ~45). Renders correctly (screenshot checked).

### 60 fps reached (2026-10-31, uncommitted)
- **Root cause of the remaining ~40–50 fps: late VI retraces from Windows timer rounding.**
  - New per-frame accounting showed ~90% of race frames needed under 16.7 ms of work (mostly under 10 ms), yet ~30% took two retraces. Each frame's breakdown is work, idle with no guest thread runnable, and GX waits (`[frame-work]`, `[time]`).
  - `[retrace]` showed most retraces delivered 4–8 ms or 8+ ms late. `[idle-loop]` showed a single "retrace wait" step lasting up to 17 ms for a ≤1 ms request.
  - Cause: a timed wait in a browser worker on Windows (`sleep_until`, and also `Atomics.wait` / `emscripten_futex_wait`, tried and measured) is rounded up to the ~15.6 ms system timer tick. Native code avoids this with `CREATE_WAITABLE_TIMER_HIGH_RESOLUTION`.
  - **Fix (`hle/vi.cpp` `SleepPreciselyUntil`, web only):** poll the clock until the deadline. Callers ask for ≤ ~1 ms at a time (idle loop, pacing), so the cost is one busy core while the game idles.
- **Result:** title/movie ~60 fps; a single-player Luigi Circuit race (started with `presskeys.mjs`) 60.0–60.8 fps; the 2-player split-screen attract race 60 fps. Almost every retrace delivered within 1 ms, nearly every present one retrace apart, 0–2 frame gaps over 25 ms per 5 s.
- **Also measured and ruled out:** guest-thread hand-off latency (~10 µs average, ~1% of time). A brief spin before parking was tried and removed.
- Removed the temporary per-frame staging-size log. The diagnostics heartbeat lines (`[frames]`, `[sync-site]`, `[time]`, `[frame-work]`, `[retrace]`, `[idle-loop]`, `[switch]`) stay for now. They're cheap but could be put behind a flag later.
- **Next:** the user tries a race themselves; then commit locally.
- **User confirmed: "feels buttery smooth"** (MILESTONES 4 and 5: a race is playable, and performance is good). Committed locally only (pushing is disabled): aurora `4e456d3`, Wiicompiled `dcd289e`.

### Disk cleanup (2026-10-31, user chose the "safe" option)
- **Browser storage:** earlier web builds had written a ~160 MB console transcript per boot into the browser's storage (`/WiiCompiled/Logs`, 2.6 GB). The current build writes none, and `RuntimeMain` now clears that folder right after mounting storage (`main.cpp`, web only, uncommitted). Browser storage went from 5.3 GB to 2.7 GB: the game files, shader cache and NAND saves remain.
- **Deleted:** `game/Mario Kart Wii (USA) (En,Fr,Es).nkit.iso` (2.6 GB); the disc stays as `game/Mario Kart Wii.7z`, `game/extracted` and the native install's `GameAssets`. Also deleted: `web/build-smoke` and `web/build-audit` (old experiments, only used by their own scripts), and `Wiicompiled/Launcher/dist` (ignored installer build output).
- Kept everything needed to play, re-import, and rebuild (emsdk, sources, `native/` with the translated shards the web build uses through the `generated` junction).
- Verified after cleanup: the game boots and holds 60 fps.
- Committed locally: Wiicompiled `54521d5` (log cleanup).

### Audio fixed (2026-10-31, uncommitted)
- User report: "the audio is so glitchy and bad". New `[audio-out]` heartbeat counters showed 30–65% of audio blocks dropped because the queue was full.
- **Two causes, both web-only:**
  1. **Playback ran on the page's main thread.** SDL's emscripten backend uses a `ScriptProcessorNode`, whose callback runs on the main thread and got skipped whenever that thread was busy. Fix (`audio_backend.cpp`): on web, samples go into a ring buffer in wasm memory, which an **AudioWorklet** (made at the game's rate, 32 kHz) reads directly on the browser's audio thread. Gain is shared through an atomic. The context resumes on the first key press or click (autoplay policy). Native builds keep SDL.
  2. **The game produced ~3x real-time audio.** `ConsumeAudioPollDeltaMicros` kept its "last poll" time `thread_local`. Natively that's one clock (all fibers on one host thread). On web each guest thread is its own pthread, so the same elapsed time was counted once per thread. Fix: `MKW_FIBER_SHARED` (`hle/audio/audio.cpp`).
- **Result:** 0 drops, 0 underruns, ~336 blocks/s (real time), queue steady at about 70–110 ms; frames still at 60 fps.
- The launcher (`Play MKW.bat`) now also opens Brave with the local debugging port (127.0.0.1:9222), so the tools can reach it.

### Startup fixed: no bulk pipeline warm-up on web (2026-10-31, uncommitted)
- Audio committed (Wiicompiled `3f4bd32`) after the user confirmed it.
- User report: the startup shows a black screen and the Wii Remote screen repeating, then a very laggy first screen that improves over time; gameplay "needs more fps".
- **The user's own session log:** ~2 minutes at 0–3 fps after boot (single frames 3–28 s), dips to 18–23 fps after loading a new scene, then 60 fps with 1–3 frames of 33 ms per 5 s.
- **Cause:** aurora's pipeline cache warms every known pipeline at startup (1,101 seeded configs, plus layout variants). On the WebGPU backend there are no compile threads, so warm-up ran on the GX worker 5 pipelines per frame, each stalling while the browser's GPU process compiled the shader (slow on Windows/D3D).
- **Fix (aurora `gfx/pipeline_cache.cpp`, web only):** `rebuild_pipeline_cache()` returns without queuing warm-up; pipelines are built when first used. The browser keeps its own compiled-shader cache across sessions.
- **Measured:** 60 fps about 30 s after reload (was ~2 minutes of 0–3 fps). A race's first ~10 s run 30–50 fps while its shaders are first built, then 60 fps.
- **Still there:** 1–3 frames of 33 ms per 5 s in races (an occasional missed retrace). 60 fps is the game's own cap: MKW runs its logic once per 60 Hz retrace.

### Frame interpolation on the web: ~120 pictures/s on 120 Hz+ screens (2026-10-31, uncommitted)
- The user has a 120 Hz+ screen (the page measured ~165 Hz). aurora already supports generated in-between frames (transform-interpolated replays between two 60 Hz game frames; gameplay unchanged). Natively the render worker sleeps until each one's deadline and presents it. On web that sleep would stall the GX worker (the only WebGPU thread), and a browser shows the canvas only when the worker returns to its event loop.
- **Web design (aurora `aurora.cpp`):** every picture (interpolated or real) is rendered into one of 4 off-screen images and queued with its deadline. `aurora_web_service_presents()` copies the newest due image into the canvas texture (the surface gets `CopyDst` usage); the GX worker calls it between record batches (every 32 records) and in its idle loop, then yields to the event loop so the browser shows it. While pictures are queued, the idle loop polls rather than doing a timed wait (Windows rounds those to ~15.6 ms).
- **Refresh rate:** `play.html` measures it with `requestAnimationFrame` (`window.mkwDisplayHz`); aurora's `update_refresh_period` and the runtime read it. On web, interpolation turns on automatically (120 fps target) when the screen is 110 Hz or faster; `play.html?interp=0` turns it off.
- **Resize safety:** pictures are laid out for the surface size the frame started with. A picture whose size no longer matches the canvas is skipped. The page reserves the scrollbar gutter, so the log growing no longer resizes the canvas (that had caused a scissor-rect validation error).
- **Measured in a race:** 121 pictures/s shown, game at 60.4 fps with no gaps over 25 ms, 0 WebGPU errors, audio still clean (0 drops).
- `[shown]` heartbeat line: pictures actually put on screen per second.
- User: "its good its working nice". Committed locally: aurora `5083d37`, Wiicompiled `e11a76d`.

## Status (2026-10-31): all milestones reached
Boots → title screen → keyboard menus → playable races → 60 fps game logic, ~120 pictures/s on the user's 165 Hz screen, clean audio, ~30 s startup. Launch with `D:\mkw-web\Play MKW.bat`.

**Open / optional:**
- Save data: `NAND/title/00010004/524d4345/data/rksys.dat` exists in the browser's storage (inside `web/brave-profile`). It's not yet verified that new progress survives a restart. Deleting the Brave profile would lose saves and the imported game.
- The first ~10 s of a new track dip while its shaders are first built (cached by the browser afterwards).
- Diagnostics lines in the log every 5 s (cheap; could go behind a flag).
- Only the keyboard has been tested. Gamepads through the browser haven't been tried. Online play is off (`network.enabled = false`).
