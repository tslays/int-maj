// Which build this is. `scripts/build.ts` overwrites this file in dist/ with
// the real values; running app/ unbuilt shows "dev". The "Report a problem"
// flow imports `BUILD` / `BUILD_LABEL` from here.
export const BUILD = Object.freeze({ version: "0.1.0-alpha.1", stage: "alpha.1", id: "dev" });
export const BUILD_LABEL = `${BUILD.stage} · ${BUILD.id}`;
