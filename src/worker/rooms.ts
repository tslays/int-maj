/**
 * The rooms Worker (`wrangler.rooms.jsonc`): it only hosts the `RoomObject`
 * Durable Object class. Nothing reaches it from the internet; the app's
 * Worker forwards `/api/room/*` to it through its `ROOMS` binding.
 */

export { RoomObject } from "./room-object.ts";

export default {
  async fetch(): Promise<Response> {
    return new Response("not found", { status: 404 });
  },
};
