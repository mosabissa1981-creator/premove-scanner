import { redirect } from "next/navigation";

/** Legacy path — Coil lives at /movers as its own app. */
export default function CheapRedirectPage() {
  redirect("/movers");
}
