# C2 city look — work in progress

The city uses uniform model scaling, collider-aligned architectural supports, brighter daylight, detailed podiums and crossings, rounded distant hills, and rounder instanced pedestrians. Touch minimap placement and HUD checks include zoom controls.

Current validation: `npm run build` PASS; `npm run check:reach` PASS (0 errors, 0 warnings). CityData, gameplay, story and audio are unchanged.

Follow-up: quiz validation PASS, kota-touch PASS on isolated port 4191, desktop hud-layout PASS. The first kota run passed functional checks but failed on the missing favicon; the app now explicitly uses its existing logo as the favicon. Desktop kota-life passed behavior checks but exceeded the geometry budget (105 calls / 806,198 triangles). City rendering now skips the extra GTAO/bloom chain to share the touch daylight pipeline; this change still requires a fresh performance run. Touch HUD verification exposed missing map/zoom and dialog DOM at measurement time; a visual frame flush was added before bounds measurement, and its rerun remains required.

The branch `codex/c2-city-look` was pushed successfully. Automatic PR creation failed with GitHub GraphQL `Forbidden`; a PR has not been created.

## Before / after

Desktop views, ordered bank/hospital, hill, market, housing, plaza, school:

![Before desktop](c2/before-desktop.jpg)
![Current desktop](c2/after-desktop.jpg)

![Before touch](c2/before-touch.jpg)
![Current touch](c2/after-touch.jpg)

## Still open

- Final close-up review of all seven owner buildings, especially Barongsai door/lion-face and climbing attachments.
- Run required smoke groups individually: kota, kota-touch, kota-life, hud-layout, hud-layout-touch, bab1; run quiz validation.
- Diagnose remaining resource 404. Performance assertions passed at 60 calls / 470,788 triangles and 31 -> 31 shader programs; runner still reported failure for the resource error.
- Verify final screenshots against the latest source; these contact sheets show the preceding visual iteration.
- Kenney road tile integration and richer near-ground detail need further review.
- Real iPhone performance and final owner visual approval remain unverified.
