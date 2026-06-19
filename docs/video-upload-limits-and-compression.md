# Video upload limits and compression

## Scope

Post video upload limits are centralized in `lib/media/upload-limits.ts`.

| User access | Maximum post video size |
| --- | --- |
| Standard user | 50 MB |
| VIP | 200 MB |
| Elder | 500 MB |

Images keep their existing 5 MB limit. Post videos also keep the existing 60 second duration limit.

The Elder badge is the highest upload tier and therefore includes the VIP video allowance.

## Access detection

The shared resolver accepts the fields already present in the project:

- Active VIP: `profiles.vip_status = 'active'` and a future `profiles.vip_expires_at`.
- VIP badge fallback: `user_badges -> badges.slug` of `vip` or `vip_premium`.
- Elder: `user_badges -> badges.slug` of `elder` (the existing Anciao badge).

The feed loads these fields to display the correct limit. `/api/r2/presign` authenticates the requester first and then reloads the entitlement with the Supabase service role before it creates a post-video upload URL. The server decision is authoritative. If that privileged lookup is unavailable, the route fails closed to the 50 MB standard limit.

## Validation

The post composer checks the selected file before upload and displays the current limit. The R2 presign route repeats that validation and returns HTTP 413 with the allowed limit when a file is too large.

The presigned PUT command includes the accepted `ContentLength`, so the signed upload URL is bound to the file size that passed the server-side validation.

## Free browser compression

`lib/media/video-compression.ts` reuses FFmpeg.wasm in the browser. Compression is optional and assisted:

1. The composer prepares the file and encodes a 720p MP4 with moderate video and audio bitrates.
2. When the first output still exceeds the requested upload limit, it tries a lighter 480p fallback.
3. The composer only replaces the selected media when the output is actually smaller.

No paid video service or Cloudflare Stream is used.

Browser video work needs substantial memory because FFmpeg.wasm holds the input and generated output locally. To avoid making the interface unresponsive, automatic browser attempts are limited to 120 MB on desktop browsers and 80 MB on mobile/Safari-like browsers. Larger files keep the upload limit warning and should be reduced with a local editor before they are selected.

4 GB uploads are intentionally out of scope for now. They are not a reliable mobile or Safari workflow and would raise memory, cache, network, upload-time, and storage concerns far beyond this initial rollout.

## Manual checks

1. As a standard user, publish a video below 50 MB and confirm a video above 50 MB is blocked with the limit message.
2. As an active VIP or with a `vip`/`vip_premium` badge, publish a video up to 200 MB.
3. With the `elder` badge, publish a video up to 500 MB and confirm it is treated as a VIP-tier user as well.
4. Select an over-limit video within the browser compression safety limit, use `Comprimir`, and confirm the 720p/480p result can be attached only when it fits.
5. Test an image upload to confirm the 5 MB image behavior is unchanged.
6. Test a mobile browser when possible, including the friendly compression failure path.

Run the production validation before release:

```powershell
npm.cmd run build
```
